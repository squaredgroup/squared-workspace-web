// Workspace WebRTC engine; protocol mirrors Backend/src/call-client.ts.
export function createCallClient(grid, notice, onEvent, socketURL) {
    const peers = new Map();
    let stream = null, ws = null, self = null, iceServers = [], started = false, ended = false, joined = false, videoOn = false, micOn = true;
    let commandQueue = Promise.resolve(), signalQueue = Promise.resolve();
    function emit(type, data = {}) { onEvent({ type, ...data }); }
    function info(text) { notice.textContent = text; }
    function tile(id, name, local = false) {
        let el = grid.querySelector('[data-peer="' + id + '"]');
        if (el)
            return el;
        el = document.createElement('section');
        el.className = 'tile' + (local ? ' local' : '');
        el.dataset.peer = id;
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = name.split(/\s+/).slice(0, 2).map(v => v[0] || '').join('').toUpperCase();
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = local;
        video.setAttribute('playsinline', '');
        const label = document.createElement('div');
        label.className = 'name';
        label.textContent = name;
        const state = document.createElement('span');
        state.className = 'state';
        label.appendChild(state);
        el.append(avatar, video, label);
        grid.appendChild(el);
        return el;
    }
    function mediaState() { emit('media', { microphone: micOn, camera: videoOn }); }
    function summary() { const connected = [...peers.values()].filter(p => p.pc.connectionState === 'connected').length; emit('participants', { count: peers.size + 1, connected, names: [self?.name || 'Vous', ...[...peers.values()].map(p => p.name)] }); info(connected ? 'La salle reste dans Workspace. Les échanges audio et vidéo ne sont pas enregistrés par Workspace.' : 'En attente des autres participants. Invitez-les depuis la conversation.'); }
    function send(data) {
        if (ws?.readyState !== WebSocket.OPEN)
            throw new Error('La connexion à la salle est interrompue.');
        ws.send(JSON.stringify(data));
    }
    function drop(id) {
        const p = peers.get(id);
        if (!p)
            return;
        clearTimeout(p.restartTimer);
        p.pc.close();
        peers.delete(id);
        grid.querySelector('[data-peer="' + id + '"]')?.remove();
        summary();
    }
    function mediaError(error) {
        const names = { NotAllowedError: 'Autorisez le micro et, pour la visio, la caméra dans les réglages de confidentialité de l’appareil.', NotFoundError: 'Aucun micro ou caméra compatible n’est disponible. Vérifiez vos périphériques.', NotReadableError: 'Un périphérique est occupé ou indisponible. Fermez son utilisation dans l’autre application.', OverconstrainedError: 'Ce périphérique ne prend pas en charge les réglages demandés.' };
        return names[error?.name] || 'La connexion audio/vidéo n’a pas pu être établie. Vérifiez le réseau puis rejoignez de nouveau la salle.';
    }
    function fail(message) { info(message); emit('error', { message }); stop(false); }
    function makePeer(remote) {
        if (peers.has(remote.id))
            return peers.get(remote.id);
        if (peers.size >= 5)
            throw new Error('Cette salle est limitée à six participants.');
        const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
        const p = { id: remote.id, name: remote.name, pc, polite: self.id > remote.id, makingOffer: false, ignoreOffer: false, settingAnswer: false, candidates: [], restarts: 0, restartTimer: null, chain: Promise.resolve() };
        peers.set(remote.id, p);
        const el = tile(remote.id, remote.name), video = el.querySelector('video'), state = el.querySelector('.state');
        state.textContent = 'Connexion…';
        const audio = stream.getAudioTracks()[0], camera = stream.getVideoTracks()[0];
        pc.addTrack(audio, stream);
        p.videoSender = camera ? pc.addTrack(camera, stream) : pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
        pc.ontrack = event => {
            video.srcObject = event.streams[0] || video.srcObject || new MediaStream();
            if (!event.streams[0])
                video.srcObject.addTrack(event.track);
            video.play().catch(() => { emit('warning', { message: 'Le son est suspendu par le système. Utilisez « Activer le son » dans la salle.' }); });
        };
        pc.onicecandidate = event => {
            if (event.candidate && !ended) {
                try {
                    send({ type: 'signal', to: remote.id, data: { candidate: event.candidate.toJSON() } });
                }
                catch {
                    fail('La signalisation de l’appel est interrompue. Rejoignez de nouveau la salle.');
                }
            }
        };
        pc.onnegotiationneeded = () => {
            p.chain = p.chain.catch(() => { }).then(async () => {
                try {
                    p.makingOffer = true;
                    await pc.setLocalDescription();
                    send({ type: 'signal', to: remote.id, data: { description: pc.localDescription } });
                }
                finally {
                    p.makingOffer = false;
                }
            }).catch(() => { emit('warning', { message: 'La connexion avec un participant doit être rétablie.' }); });
        };
        pc.onconnectionstatechange = () => {
            state.textContent = ({ connected: '', connecting: 'Connexion…', disconnected: 'Reconnexion…', failed: 'Réseau indisponible', closed: 'Déconnecté' })[pc.connectionState] || 'Connexion…';
            summary();
            clearTimeout(p.restartTimer);
            if (['disconnected', 'failed'].includes(pc.connectionState) && p.restarts < 2) {
                p.restartTimer = setTimeout(() => {
                    if (!ended && peers.has(p.id)) {
                        p.restarts++;
                        pc.restartIce();
                    }
                }, pc.connectionState === 'failed' ? 1000 : 8000);
            }
            if (pc.connectionState === 'failed')
                emit('warning', { message: 'Un participant ne reçoit pas les médias. Le réseau ou le relais doit être vérifié.' });
        };
        summary();
        return p;
    }
    async function signal(message) {
        const p = peers.get(message.from);
        if (!p)
            return;
        p.chain = p.chain.catch(() => { }).then(async () => {
            const { description, candidate } = message.data;
            if (description) {
                const ready = !p.makingOffer && (p.pc.signalingState === 'stable' || p.settingAnswer), collision = description.type === 'offer' && !ready;
                p.ignoreOffer = !p.polite && collision;
                if (p.ignoreOffer)
                    return;
                p.settingAnswer = description.type === 'answer';
                try {
                    await p.pc.setRemoteDescription(description);
                }
                finally {
                    p.settingAnswer = false;
                }
                for (const c of p.candidates.splice(0))
                    await p.pc.addIceCandidate(c);
                if (description.type === 'offer') {
                    await p.pc.setLocalDescription();
                    send({ type: 'signal', to: p.id, data: { description: p.pc.localDescription } });
                }
            }
            else if (candidate) {
                if (p.ignoreOffer)
                    return;
                if (p.pc.remoteDescription)
                    await p.pc.addIceCandidate(candidate);
                else if (p.candidates.length < 256)
                    p.candidates.push(candidate);
            }
        });
        await p.chain;
    }
    async function camera(enabled) {
        if (!joined || ended)
            return;
        if (enabled) {
            const capture = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
            const track = capture.getVideoTracks()[0];
            if (ended) {
                capture.getTracks().forEach(t => t.stop());
                return;
            }
            try {
                await Promise.all([...peers.values()].map(p => p.videoSender.replaceTrack(track)));
            }
            catch (error) {
                capture.getTracks().forEach(t => t.stop());
                throw error;
            }
            stream.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t); });
            stream.addTrack(track);
            track.onended = () => { videoOn = false; mediaState(); };
            videoOn = true;
        }
        else {
            await Promise.all([...peers.values()].map(p => p.videoSender.replaceTrack(null)));
            stream.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t); });
            videoOn = false;
        }
        grid.querySelector('[data-peer="local"]').querySelector('video').srcObject = stream;
        mediaState();
    }
    function stop(announce = true) {
        if (ended)
            return;
        ended = true;
        joined = false;
        for (const p of peers.values()) {
            clearTimeout(p.restartTimer);
            p.pc.close();
        }
        peers.clear();
        stream?.getTracks().forEach(t => t.stop());
        stream = null;
        if (ws) {
            ws.onclose = null;
            ws.close(1000, 'Appel quitté');
            ws = null;
        }
        grid.querySelectorAll('video').forEach(v => { v.pause(); v.srcObject = null; });
        if (announce)
            emit('ended');
    }
    async function start(options) {
        if (started)
            return;
        started = true;
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
            fail('L’audio/vidéo intégré n’est pas disponible dans ce contexte sécurisé.');
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: options.video ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } : false });
            if (ended) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            videoOn = stream.getVideoTracks().length > 0;
            tile('local', 'Vous', true).querySelector('video').srcObject = stream;
            mediaState();
            let url = new URL(socketURL);
            url.protocol = 'wss:';
            ws = new WebSocket(url);
            ws.onopen = () => { send({ type: 'join', ticket: options.ticket }); options.ticket = ''; };
            ws.onmessage = event => {
                signalQueue = signalQueue.then(async () => {
                    const m = JSON.parse(event.data);
                    if (m.type === 'joined') {
                        self = m.self;
                        iceServers = m.iceServers;
                        joined = true;
                        for (const peer of m.peers)
                            makePeer(peer);
                        emit('joined', { relayReady: m.relayReady });
                        summary();
                    }
                    else if (m.type === 'peer.joined')
                        makePeer(m.peer);
                    else if (m.type === 'peer.left')
                        drop(m.id);
                    else if (m.type === 'signal')
                        await signal(m);
                    else if (m.type === 'error')
                        fail(m.message || 'L’accès à la salle a été refusé.');
                }).catch(() => { emit('warning', { message: 'La négociation avec un participant n’a pas abouti. Rejoignez de nouveau la salle si nécessaire.' }); });
            };
            ws.onerror = () => fail('La connexion sécurisée à la salle a échoué. Vérifiez votre réseau.');
            ws.onclose = event => fail(event.code === 4003 ? 'Votre accès à cette conversation ou votre session a été retiré.' : 'La salle a été déconnectée. Rejoignez-la de nouveau.');
        }
        catch (error) {
            fail(mediaError(error));
        }
    }
    const client = { start, leave: () => stop(), command: action => {
            commandQueue = commandQueue.then(async () => {
                if (!joined || ended)
                    return;
                if (action === 'microphone') {
                    micOn = !micOn;
                    stream.getAudioTracks().forEach(t => { t.enabled = micOn; });
                    mediaState();
                }
                if (action === 'camera')
                    await camera(!videoOn);
                if (action === 'sound')
                    await Promise.all([...grid.querySelectorAll('video')].filter(v => !v.muted).map(v => v.play()));
            }).catch(error => emit('warning', { message: mediaError(error) }));
            return commandQueue;
        } };
    const leave = () => stop();
    window.addEventListener('pagehide', leave);
    client.destroy = () => { stop(); window.removeEventListener('pagehide', leave); };
    emit('ready');
    return client;
}
