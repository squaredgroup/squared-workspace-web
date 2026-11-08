import { state, setRoute, h, button, field, input, select, textarea, card, emptyState, toast, modal, hasAny, scope, statusDot, confirmDialog, call, rows, choices, stack, actions, notice, toggle, bind, uid, clone, block, listStudio, saveDoc, lifecycle, errorBox, term } from './operation-kit.js';
import { dataTable } from './components.js';
import { listSpecialized } from '../api.js';
import { formatDate, profileAvatar } from '../ui.js';
import { editStudio } from './studio.js';
const drafts = new Map();
let draftOwner = '';
export async function collaboration() {
    if (draftOwner !== scope()) {
        drafts.clear();
        draftOwner = scope();
    }
    const owner = scope(), root = stack(), choice = select('', choices(await listStudio('page'), 'Choisir une page')), body = stack(), feedback = h('div');
    const commentDrafts = new Map();
    let current = null, editing = null, busy = false, sessionID = uid(), commentID = uid(), timer;
    const request = async (path, options) => {
        const result = await call(path, options);
        if (scope() !== owner)
            throw Error('Le compte a changé.');
        return result;
    };
    const refresh = async () => {
        if (!current || busy || document.visibilityState !== 'visible' || !root.isConnected)
            return;
        try {
            const data = await request('/v1/studio/documents/' + current.id + '/presence', { method: 'POST', body: { sessionID, blockID: editing?.base ? editing.next.id : null } });
            current = data.document;
            draw(data.members || []);
        }
        catch (e) {
            feedback.replaceChildren(errorBox(e));
        }
    };
    const draw = (members = []) => {
        const active = document.activeElement;
        if (body.contains(active) && active?.matches('textarea,input'))
            return;
        body.replaceChildren();
        if (!current)
            return;
        body.append(notice('Présence actualisée toutes les 10 secondes. Un repère désigne le bloc choisi ; la publication du texte reste explicite.'), h('div', { class: 'sq-presence' }, ...members.map(m => h('span', { class: 'sq-presence-member' }, h('span', { text: m.name }), h('small', { text: m.blockID ? ' · dans un bloc' : ' · consulte' })))));
        for (const item of current.content.blocks)
            body.append(card(item.kind, item.id === editing?.next.id ? 'Bloc sélectionné' : '', stack(h('p', { text: item.text || item.url || 'Bloc sans texte' }), hasAny('manageDocuments') ? button('Éditer le bloc', { iconName: 'edit', disabled: !!editing, onClick: () => { editing = { base: clone(item), next: clone(item) }; drafts.set(current.id, editing); draw(); } }) : null)));
        if (hasAny('manageDocuments'))
            body.append(button('Ajouter un bloc', { iconName: 'add', disabled: !!editing, onClick: () => { editing = { base: null, next: block() }; drafts.set(current.id, editing); draw(); } }));
        if (editing) {
            const edit = editing, remote = current.content.blocks.find(v => v.id === edit.next.id), text = bind(textarea(edit.next.text, { rows: 6 }), v => { edit.next.text = v; drafts.set(current.id, edit); }), type = bind(select(edit.next.kind, [{ value: 'text', label: 'Texte' }, { value: 'heading', label: 'Titre' }, { value: 'checklist', label: 'Checklist' }]), v => { edit.next.kind = v; draw(); }, 'change');
            if (!['text', 'heading', 'checklist'].includes(edit.next.kind))
                type.disabled = true;
            const pane = stack(field('Type de bloc', type), field('Votre texte', text));
            if (edit.next.kind === 'checklist')
                pane.append(toggle('Terminé', edit.next.checked, v => edit.next.checked = v));
            if (edit.base && JSON.stringify(remote) !== JSON.stringify(edit.base)) {
                pane.append(notice(remote ? 'Le bloc distant a changé. Votre saisie est conservée.' : 'Le bloc a été retiré du serveur. Votre saisie est conservée.', 'warning'), h('p', { text: remote?.text || '' }), button(remote ? 'Reprendre cette version comme base en gardant ma saisie' : 'Recréer ma saisie dans un nouveau bloc', { iconName: 'edit', onClick: async () => {
                        if (!await confirmDialog({ title: 'Conserver votre saisie ?', message: 'Vous reprenez explicitement le texte distant comme nouvelle base, sans publier encore votre saisie.' }))
                            return;
                        if (remote)
                            edit.base = clone(remote);
                        else {
                            edit.base = null;
                            edit.next.id = uid();
                        }
                        draw();
                    } }));
            }
            const publish = async (removing) => {
                if (busy)
                    return;
                if (removing && !await confirmDialog({ title: 'Retirer ce bloc ?', message: 'Le serveur vérifiera qu’il n’a pas changé. Son historique sera conservé.', danger: true }))
                    return;
                busy = true;
                try {
                    const data = await request('/v1/studio/documents/' + current.id + '/blocks/' + edit.next.id, { method: 'POST', body: { base: edit.base, next: removing ? null : edit.next } });
                    current = data.document;
                    drafts.delete(current.id);
                    editing = null;
                    feedback.replaceChildren(notice('Bloc publié.', 'success'));
                    draw();
                }
                catch (e) {
                    feedback.replaceChildren(errorBox(e));
                }
                finally {
                    busy = false;
                }
            };
            pane.append(actions(button('Publier le bloc', { iconName: 'check', kind: 'primary', onClick: () => publish(false) }), button('Relire le serveur', { iconName: 'sync', onClick: async () => { body.querySelector('textarea')?.blur(); await refresh(); } }), button('Abandonner la saisie', { iconName: 'close', onClick: async () => {
                    if (await confirmDialog({ title: 'Abandonner votre saisie ?', message: 'La saisie non publiée de ce bloc sera retirée.', danger: true })) {
                        drafts.delete(current.id);
                        editing = null;
                        draw();
                    }
                } }), edit.base ? button('Retirer le bloc', { iconName: 'trash', onClick: () => publish(true) }) : null));
            body.append(card('Bloc sélectionné', '', pane));
        }
        const notes = stack(), comment = textarea(commentDrafts.get(current.id) || '', { rows: 3, placeholder: 'Remarque liée à cette page…' });
        comment.addEventListener('input', () => commentDrafts.set(current.id, comment.value));
        body.append(card('Commentaires de la page', 'Même périmètre d’accès que la page.', stack(notes, field('Remarque', comment), button('Publier la remarque', { iconName: 'send', onClick: async () => {
                if (!comment.value.trim())
                    return;
                const doc = { id: commentID, kind: 'annotation', title: 'Remarque · ' + current.title, projectID: current.projectID, entityKind: 'studio-page', entityID: current.id, shared: true, version: 0, content: { description: comment.value } };
                await saveDoc(doc);
                commentID = uid();
                comment.value = '';
                commentDrafts.delete(current.id);
                await readNotes(notes);
            } }))));
        void readNotes(notes).catch(e => notes.replaceChildren(errorBox(e)));
    };
    async function readNotes(node) {
        if (!current)
            return;
        const notes = await listStudio('annotation', { entityID: current.id });
        if (scope() !== owner)
            return;
        node.replaceChildren(...notes.filter(v => v.entityKind === 'studio-page').map(note => h('div', { class: 'sq-comment' }, h('p', { text: note.content.description }), note.content.resolved ? statusDot('completed', 'Résolu') : hasAny('manageDocuments') || note.ownerID === state.user.id ? button('Résoudre', { iconName: 'check', onClick: async () => { const next = clone(note); next.content.resolved = true; await saveDoc(next); await readNotes(node); } }) : null)));
    }
    choice.addEventListener('change', async () => {
        if (editing) {
            choice.value = current.id;
            toast('Publiez ou abandonnez le bloc en cours avant de changer de page.', 'error');
            return;
        }
        const docs = await listStudio('page');
        current = docs.find(v => v.id === choice.value) || null;
        editing = current ? drafts.get(current.id) || null : null;
        commentID = uid();
        draw();
        await refresh();
    });
    root.append(actions(field('Page', choice), hasAny('manageDocuments') ? button('Nouvelle page', { iconName: 'add', onClick: async () => { const { blankDoc } = await import('./operation-kit.js'); editStudio(blankDoc()); } }) : null), feedback, body);
    timer = setInterval(() => void refresh(), 10000);
    lifecycle(root, () => clearInterval(timer));
    return root;
}
export async function attendance() {
    const root = stack(), code = input('', { placeholder: 'SGW1:…' }), identity = stack(), journal = stack(), feedback = h('div');
    let verified = null, verifiedCode = '', operationID = uid(), cursor = null;
    const direction = select('in', [{ value: 'in', label: 'Entrée' }, { value: 'out', label: 'Sortie' }]);
    code.addEventListener('input', () => { verified = null; identity.replaceChildren(); });
    const verify = async () => {
        const result = await call('/v1/badges/verify', { method: 'POST', body: { code: code.value.trim() } });
        if (result.valid !== true || !result.memberID)
            throw Error('Badge invalide ou révoqué.');
        if (verifiedCode !== code.value)
            operationID = uid();
        verified = result;
        verifiedCode = code.value;
        identity.replaceChildren(card(result.name, result.title, stack(profileAvatar({ ...result, avatarData: result.avatarData }, { size: 54 }), notice('Badge vérifié.', 'success'), hasAny('manageHR') ? field('Pointage', direction) : null, hasAny('manageHR') && hasAny('manageTeam') ? button('Confirmer le pointage', { iconName: 'check', kind: 'primary', onClick: async () => {
                if (!verified || code.value !== verifiedCode)
                    throw Error('Revérifiez le badge.');
                if (!await confirmDialog({ title: 'Enregistrer cette ' + (direction.value === 'in' ? 'entrée' : 'sortie') + ' ?', message: verified.name + ' · le serveur vérifiera de nouveau le badge et fixera l’heure.' }))
                    return;
                const data = await call('/v1/operations/attendance', { method: 'POST', body: { id: operationID, memberID: verified.memberID, code: code.value.trim(), direction: direction.value, confirmed: true } });
                operationID = uid();
                verified = null;
                identity.replaceChildren();
                feedback.replaceChildren(notice('Pointage confirmé · ' + formatDate(data.event?.occurredAt), 'success'));
            } }) : null)));
    };
    root.append(notice('Le badge identifie le membre ; il ne donne aucun accès au Workspace. Un pointage demande les droits Équipe et RH et une confirmation.'), hasAny('manageTeam') ? field('Code du badge · lecteur PDF417 ou saisie', code) : null, hasAny('manageTeam') ? button('Vérifier le badge', { iconName: 'shield', onClick: verify }) : null, identity, feedback);
    const photo = input('', { type: 'file' });
    photo.accept = 'image/*';
    photo.addEventListener('change', async () => {
        const file = photo.files?.[0];
        if (!file)
            return;
        try {
            if (!globalThis.BarcodeDetector)
                throw Error('La lecture PDF417 depuis une image n’est pas disponible dans ce navigateur. Utilisez un lecteur de badge ou saisissez sa valeur.');
            if (file.size > 8 * 1024 * 1024)
                throw Error('La photo dépasse 8 Mo.');
            const supported = await globalThis.BarcodeDetector.getSupportedFormats();
            if (!supported.includes('pdf417'))
                throw Error('Ce navigateur ne prend pas en charge PDF417.');
            const image = await createImageBitmap(file);
            try {
                const detected = await new globalThis.BarcodeDetector({ formats: ['pdf417'] }).detect(image), values = [...new Set(detected.map(v => v.rawValue).filter(v => /^SGW1:[a-f0-9]{48}$/.test(v)))];
                if (values.length !== 1)
                    throw Error('Une seule valeur de badge Workspace doit être lisible.');
                code.value = values[0];
                code.dispatchEvent(new Event('input'));
                await verify();
            }
            finally {
                image.close();
            }
        }
        catch (e) {
            feedback.replaceChildren(errorBox(e));
        }
    });
    if (hasAny('manageTeam'))
        root.append(field('Lire une photo du badge si le navigateur le permet', photo));
    const load = async (more) => {
        const data = await call('/v1/operations/attendance' + (more && cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
        if (!more)
            journal.replaceChildren();
        journal.append(dataTable({ rows: data.items || [], name: 'attendance-' + uid(), columns: [{ id: 'name', label: 'Collaborateur' }, { id: 'direction', label: 'Pointage', render: r => term(r.direction) }, { id: 'occurredAt', label: 'Heure serveur', render: r => formatDate(r.occurredAt) }] }));
        cursor = data.nextCursor;
        moreButton.hidden = !cursor;
    };
    const moreButton = button('Charger la suite du journal', { iconName: 'add', onClick: () => load(true) });
    moreButton.hidden = true;
    if (hasAny('manageHR'))
        root.append(button('Lire le journal autorisé', { iconName: 'sync', onClick: () => load(false) }), journal, moreButton);
    root.append(notice('Le journal conserve les entrées et sorties. Il ne calcule pas automatiquement la paie ou une durée réglementaire.'));
    return root;
}
export async function approvals() {
    const root = stack(), catalog = stack(), requests = stack(), feedback = h('div');
    let circuits = [], items = [], cursor = null;
    const reload = async (more) => { const data = await call('/v1/operations/approvals' + (more && cursor ? '?cursor=' + cursor : '')); circuits = data.circuits || []; items = more ? [...items, ...data.items.filter(v => !items.some(i => i.id === v.id))] : data.items || []; cursor = data.nextCursor; draw(); };
    const draw = () => {
        catalog.replaceChildren();
        requests.replaceChildren(dataTable({ rows: items, name: 'approval-requests', columns: [{ id: 'title', label: 'Demande' }, { id: 'state', label: 'État', render: r => statusDot(r.state, term(r.state)) }, { id: 'currentStep', label: 'Étape', render: r => Math.min(r.currentStep + 1, r.steps.length) + ' / ' + r.steps.length }, { id: 'version', label: 'Version' }], onOpen: r => approvalDecision(r.id, () => reload(false)) }));
        if (cursor)
            requests.append(button('Charger la suite', { iconName: 'add', onClick: () => reload(true) }));
        if (hasAny('manageOrganization')) {
            catalog.append(actions(button('Configurer un circuit', { iconName: 'add', onClick: () => circuitEditor(null, () => reload(false)) }), button('Préparer une demande', { iconName: 'send', onClick: () => approvalRequest(circuits, () => reload(false)) })));
            for (const circuit of circuits)
                catalog.append(card(circuit.title, circuit.steps.length + ' étape(s) · version ' + circuit.version, button('Modifier le circuit', { iconName: 'edit', onClick: () => circuitEditor(circuit, () => reload(false)) })));
        }
    };
    root.append(notice('Revue interne versionnée : les décisions ne publient pas un livrable et ne remplacent pas les circuits contractuels, comptables ou de paiement.'), button('Actualiser les demandes', { iconName: 'sync', onClick: () => reload(false) }), feedback, catalog, requests);
    try {
        await reload(false);
    }
    catch (e) {
        feedback.append(errorBox(e));
    }
    return root;
}
function circuitEditor(initial, reload) {
    let doc = clone(initial || { id: uid(), title: 'Nouveau circuit', steps: [{ id: uid(), title: 'Revue', mode: 'all', reviewerIDs: [] }], version: 0 });
    const title = bind(input(doc.title, { required: true }), v => doc.title = v), steps = stack(), feedback = h('div');
    const draw = () => {
        steps.replaceChildren();
        for (const [index, step] of doc.steps.entries()) {
            const members = stack();
            for (const member of rows('team'))
                members.append(toggle(member.name || member.email, step.reviewerIDs.includes(member.id), v => {
                    step.reviewerIDs = step.reviewerIDs.filter(id => id !== member.id);
                    if (v)
                        step.reviewerIDs.push(member.id);
                }));
            steps.append(card('Étape ' + (index + 1), '', stack(field('Intitulé', bind(input(step.title, { required: true }), v => step.title = v)), field('Règle', bind(select(step.mode, [{ value: 'all', label: 'Tous les approbateurs' }, { value: 'any', label: 'Un approbateur suffit' }]), v => step.mode = v, 'change')), h('details', { class: 'sq-reviewer-picker' }, h('summary', { text: 'Choisir les approbateurs' }), members), actions(button('Monter', { iconName: 'ChevronUp', disabled: index === 0, onClick: () => { [doc.steps[index - 1], doc.steps[index]] = [step, doc.steps[index - 1]]; draw(); } }), button('Descendre', { iconName: 'ChevronDown', disabled: index === doc.steps.length - 1, onClick: () => { [doc.steps[index], doc.steps[index + 1]] = [doc.steps[index + 1], step]; draw(); } }), button('Retirer', { iconName: 'trash', disabled: doc.steps.length < 2, onClick: () => { doc.steps = doc.steps.filter(v => v.id !== step.id); draw(); } })))));
        }
    };
    modal({ title: 'Circuit d’approbation', wide: true, content: stack(field('Nom du circuit', title), steps, button('Ajouter une étape', { iconName: 'add', onClick: () => {
                if (doc.steps.length >= 12)
                    throw Error('Douze étapes maximum.');
                doc.steps.push({ id: uid(), title: 'Nouvelle étape', mode: 'all', reviewerIDs: [] });
                draw();
            } }), feedback), actions: [{ label: 'Enregistrer le circuit', kind: 'primary', icon: 'check', onClick: async () => {
                    if (doc.steps.some(v => v.title.trim().length < 2 || !v.reviewerIDs.length))
                        throw Error('Renseignez le titre et les approbateurs de chaque étape.');
                    if (!await confirmDialog({ title: 'Enregistrer ce circuit ?', message: 'Les demandes déjà envoyées conserveront leurs étapes actuelles.' }))
                        return;
                    try {
                        doc = (await call('/v1/operations/approvals/circuits/' + doc.id, { method: 'PUT', body: { title: doc.title, steps: doc.steps, version: doc.version } })).circuit;
                        feedback.replaceChildren(notice('Circuit version ' + doc.version + ' enregistré.', 'success'));
                        await reload();
                    }
                    catch (e) {
                        feedback.replaceChildren(errorBox(e));
                    }
                } }] });
    draw();
}
async function approvalRequest(circuits, reload) {
    const { pilotageSources } = await import('./operations.js');
    const collected = await pilotageSources(hasAny('manageProjects') ? 'projects' : 'mobile'), mapping = { projects: 'project', missions: 'mission', tasks: 'task', documents: 'document', deliverables: 'deliverable' }, items = collected.nodes.filter(n => mapping[n.kind]), source = select('', choices(items.map(v => ({ id: v.key, title: v.title + ' · v' + v.version })), 'Choisir une fiche')), circuit = select('', choices(circuits, 'Choisir un circuit')), id = uid();
    modal({ title: 'Demander une revue', content: stack(notice('La version de la fiche et les étapes seront figées au moment de la demande.'), field('Fiche source', source), field('Circuit', circuit)), actions: [{ label: 'Demander la revue', kind: 'primary', icon: 'send', onClick: async (close) => {
                    const row = items.find(v => v.key === source.value);
                    if (!row || !circuit.value)
                        throw Error('Choisissez une fiche et un circuit.');
                    if (!await confirmDialog({ title: 'Demander la revue de cette version ?', message: row.title + ' · version ' + row.version }))
                        return;
                    await call('/v1/operations/approvals', { method: 'POST', body: { id, circuitID: circuit.value, entityKind: mapping[row.kind], entityID: row.key.slice(row.kind.length + 1), entityVersion: row.version, title: row.title } });
                    close();
                    await reload();
                } }] });
}
async function approvalDecision(id, reload) {
    const root = stack(), feedback = h('div');
    let data, operationID = uid(), note = textarea('', { rows: 3 });
    const refresh = async () => { data = await call('/v1/operations/approvals/' + id); draw(); };
    const decide = async (decision) => {
        if (decision === 'rejected' && note.value.trim().length < 3)
            throw Error('Précisez le motif du refus.');
        if (!await confirmDialog({ title: 'Confirmer cette décision ?', message: 'La décision et son motif seront conservés dans le journal de cette version.' }))
            return;
        try {
            await call('/v1/operations/approvals/' + id + '/decisions', { method: 'POST', body: { id: operationID, version: data.request.version, decision, note: note.value, confirmed: true } });
            operationID = uid();
            await refresh();
            await reload();
        }
        catch (e) {
            feedback.replaceChildren(errorBox(e));
        }
    };
    const draw = () => {
        const request = data.request, current = request.steps[request.currentStep], reviewer = current?.reviewerIDs.includes(state.user.id) && request.requesterID !== state.user.id;
        root.replaceChildren(h('h2', { text: request.title }), statusDot(request.state, term(request.state)), button('Actualiser', { iconName: 'sync', onClick: refresh }), ...request.steps.map((s, i) => h('p', { text: (i + 1) + '. ' + s.title + ' · ' + term(s.mode) })), ...data.decisions.map(v => h('p', { text: term(v.decision) + ' · ' + formatDate(v.occurredAt) + ' · ' + v.note })));
        if (request.state === 'pending')
            root.append(field('Motif', note), actions(reviewer ? button('Approuver l’étape', { kind: 'primary', iconName: 'check', onClick: () => decide('approved') }) : null, reviewer ? button('Refuser', { iconName: 'close', onClick: () => decide('rejected') }) : null, request.requesterID === state.user.id || hasAny('manageOrganization') ? button('Retirer la demande', { iconName: 'archive', onClick: () => decide('cancelled') }) : null));
    };
    modal({ title: 'Revue et décisions', wide: true, content: stack(root, feedback) });
    await refresh();
}
export async function feedback() {
    const root = stack(), items = await listSpecialized('product-feedback');
    root.append(notice('Un vote par membre et par suggestion. Le vote ne change pas la décision produit.'));
    if (hasAny('manageOrganization'))
        root.append(button('Ajouter une suggestion', { iconName: 'add', onClick: async () => { const { specializedForm } = await import('../modules/data.js'); specializedForm('product-feedback', null, () => window.dispatchEvent(new Event('sq:refresh'))); } }));
    root.append(dataTable({ rows: items, name: 'feedback', columns: [{ id: 'title', label: 'Suggestion' }, { id: 'status', label: 'État' }], onOpen: async (row) => { let votes = await call('/v1/operations/feedback/' + row.id + '/votes'); const count = h('p'), vote = button('', { iconName: 'star', onClick: async () => { votes = await call('/v1/operations/feedback/' + row.id + '/vote', { method: 'POST', body: { enabled: !votes.mine } }); draw(); } }), draw = () => { count.textContent = votes.total + ' vote(s)'; vote.querySelector('span').textContent = votes.mine ? 'Retirer mon vote' : 'Voter pour cette suggestion'; }; modal({ title: row.title, content: stack(h('p', { text: row.data?.detail || '' }), count, vote) }); draw(); } }));
    return root;
}
