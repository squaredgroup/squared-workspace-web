import { state, h, button, field, select, stack, actions, notice, modal, call, scope, hasAny, lifecycle } from './operation-kit.js';
import { subscribe } from '../store.js';
import { createCallClient } from './call-client.js';
let active = null;
export function openWorkspaceCall(conversation, mode = 'audio') {
    if (!hasAny('sendMessages'))
        throw Error('Le droit de messagerie est requis.');
    if (active) {
        active.panel.focus();
        return active;
    }
    const owner = scope(), grid = h('div', { class: 'sq-call-grid', 'aria-label': 'Participants à l’appel' }), status = h('p', { role: 'status', class: 'sq-call-status', text: 'Choisissez de rejoindre la salle pour autoriser le microphone.' }), root = stack(notice('La salle reste dans Workspace et accepte six participants au maximum. L’audio et la vidéo ne sont pas enregistrés par Workspace.'), grid, status), settings = select(mode, [{ value: 'audio', label: 'Audio' }, { value: 'video', label: 'Audio et vidéo' }]);
    let engine = null, joined = false, disposed = false, stopWatch;
    const microphone = button('Microphone', { iconName: 'phone', disabled: true, onClick: () => engine?.command('microphone') }), camera = button('Caméra', { iconName: 'video', disabled: true, onClick: () => engine?.command('camera') }), sound = button('Activer le son', { iconName: 'phone', disabled: true, onClick: () => engine?.command('sound') }), join = button('Rejoindre la salle', { iconName: 'phone', kind: 'primary', onClick: async () => {
            if (owner !== scope() || disposed)
                throw Error('La session a changé.');
            engine?.destroy();
            grid.replaceChildren();
            const prepared = await call('/v1/messaging/calls/ticket', { method: 'POST', body: { conversationID: conversation.id, mode: settings.value } });
            if (disposed || owner !== scope())
                return;
            const socket = new URL('/v1/messaging/calls/socket', prepared.clientURL);
            socket.protocol = socket.protocol === 'https:' ? 'wss:' : 'ws:';
            engine = createCallClient(grid, status, message => {
                if (disposed)
                    return;
                if (message.type === 'joined') {
                    joined = true;
                    join.hidden = true;
                    settings.disabled = true;
                    microphone.disabled = false;
                    camera.disabled = false;
                    sound.disabled = false;
                    if (!message.relayReady)
                        status.textContent = 'Salle ouverte. Le serveur ne signale aucun relais TURN ; les réseaux restrictifs peuvent empêcher les médias.';
                }
                else if (message.type === 'media') {
                    microphone.setAttribute('aria-pressed', String(message.microphone));
                    camera.setAttribute('aria-pressed', String(message.camera));
                }
                else if (message.type === 'warning' || message.type === 'error') {
                    status.textContent = message.message;
                    if (message.type === 'error') {
                        joined = false;
                        join.hidden = false;
                        settings.disabled = false;
                        microphone.disabled = true;
                        camera.disabled = true;
                        sound.disabled = true;
                    }
                }
                else if (message.type === 'ended')
                    status.textContent = 'Appel quitté.';
            }, socket.href);
            await engine.start({ ticket: prepared.ticket, video: settings.value === 'video' });
        } });
    const destroy = () => {
        if (disposed)
            return;
        disposed = true;
        engine?.destroy();
        stopWatch?.();
        active = null;
    };
    root.prepend(field('Mode de l’appel', settings));
    root.append(actions(join, microphone, camera, sound));
    const dialog = modal({ title: 'Appel · ' + (conversation.name || 'Conversation'), wide: true, className: 'sq-workspace-call', content: root, onClose: destroy, actions: [{ label: 'Quitter la salle', icon: 'close', onClick: close => close() }] });
    active = dialog;
    stopWatch = subscribe(() => {
        if (scope() !== owner)
            dialog.close();
    });
    return dialog;
}
