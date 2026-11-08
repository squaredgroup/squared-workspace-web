import { state, setRoute, h, button, field, input, select, textarea, card, emptyState, toast, modal, hasAny, scope, statusDot, confirmDialog, call, rows, choices, stack, actions, notice, toggle, bind, uid, block, blankDoc, listStudio, lifecycle, errorBox, PrivatePreferences } from './operation-kit.js';
import { OPERATION_PAGES } from './operation-catalog.js';
import { dataTable, displayValue, downloadBlob } from './components.js';
import { pageHeader, formatDate } from '../ui.js';
import { SECTIONS, canAccessSection, canAccessSubpage } from '../config.js';
import { listSpecialized, uploadFile } from '../api.js';
import { subscribe } from '../store.js';
import { studioLibrary, editStudio, historyPanel } from './studio.js';
import { collaboration, attendance, approvals, feedback } from './operation-workflows.js';
import { fileBlob, openMedia } from './media.js';
import { renderWorkflowGroup } from './workflows.js';
import { LocalVault, encodeBytes, decodeBytes } from './offline-vault.js';
const allowed = p => !p.permissions.length || hasAny(p.permissions);
const closed = v => /^(completed|cancelled|approved|delivered|rejected|done|closed)$/.test(v || '');
const sourceRoutes = { projects: 'projects', missions: 'missions', tasks: 'tasks', documents: 'documents', deliverables: 'deliverables', clients: 'clients', conversations: 'messages', validations: 'validations' };
const openSource = node => {
    const section = sourceRoutes[node.kind];
    if (section && canAccessSection(section, state.user))
        setRoute(section, '', node.key.slice(node.kind.length + 1));
    else
        modal({ title: node.title, content: displayValue(node), wide: true });
};
export async function renderOperations(subpage = 'operations') {
    const page = OPERATION_PAGES.find(p => p.id === subpage);
    if (!page) {
        const search = input('', { type: 'search', placeholder: 'Rechercher un parcours…' }), grid = h('div', { class: 'sq-operation-grid' }), draw = () => { grid.replaceChildren(...OPERATION_PAGES.filter(allowed).filter(p => (p.title + ' ' + p.summary).toLocaleLowerCase('fr').includes(search.value.toLocaleLowerCase('fr'))).map(p => card(p.title, p.summary, button('Ouvrir', { iconName: p.icon, onClick: () => setRoute('activity', p.id) })))); };
        search.addEventListener('input', draw);
        draw();
        return stack(pageHeader({ eyebrow: 'Votre Workspace', title: 'Opérations', subtitle: '24 parcours reliés aux dossiers et aux droits de votre compte.' }), field('Parcours', search), grid);
    }
    if (!allowed(page))
        return emptyState('Accès réservé', 'Vos droits ne permettent pas d’ouvrir ce parcours.', 'lock');
    const root = stack(pageHeader({ eyebrow: 'Opérations', title: page.title, subtitle: page.summary }));
    try {
        if (['collaboration', 'attendance', 'approvals', 'feedback', 'recovery'].includes(page.key)) {
            const contract = await call('/v1/operations/capabilities');
            if (contract.contract !== 'operations-144-v1' || contract.features?.[page.key] !== true) {
                root.append(notice('Ce parcours attend le contrat Opérations 144 sur le serveur connecté.', 'warning'));
                return root;
            }
        }
        const handlers = { collaboration, aftercare, offline, repair, deliveries, attendance, review, inbox, relationships, desks, commitments, forms: () => studioLibrary({ kind: 'form' }), approvals, brands, retrospectives: () => studioLibrary({ category: 'retrospective', title: 'Retour d’expérience', template: ['Résultat attendu et constaté', 'Ce qui a fonctionné', 'Difficultés et faits observés', 'Causes à vérifier', 'Décisions, responsables et échéances', 'À reprendre dans les modèles'] }), scenarios: () => studioLibrary({ kind: 'scenario' }), access, recovery, presentation, glossary, sandbox, assistant, feedback, incident };
        root.append(await handlers[page.key]());
    }
    catch (error) {
        root.append(errorBox(error), button('Relire ce parcours', { iconName: 'sync', onClick: () => window.dispatchEvent(new Event('sq:refresh')) }));
    }
    return root;
}
export async function pilotageSources(lensID = 'mobile') {
    const catalog = await call('/v1/workflows/pilotage/catalog'), lens = (catalog.lenses || []).find(v => v.id === lensID);
    if (!lens)
        throw Error('Ce contexte ne fait pas partie de votre périmètre.');
    const nodes = [], pending = [], failures = [];
    for (const kind of lens.sources || []) {
        try {
            const data = await call('/v1/workflows/pilotage/sources?' + new URLSearchParams({ lens: lens.id, kind }));
            nodes.push(...(data.items || []));
            if (data.nextCursor)
                pending.push({ kind, cursor: data.nextCursor });
        }
        catch (error) {
            failures.push({ kind, message: error.message });
        }
    }
    return { catalog, lens, nodes, pending, failures };
}
async function recordTable(kinds) {
    const root = stack(), body = stack();
    const draw = async () => {
        body.replaceChildren();
        for (const kind of kinds) {
            try {
                const records = await listSpecialized(kind), definition = state.domainCatalog?.kinds?.find(v => v.kind === kind || v.id === kind), title = definition?.title || kind;
                const { specializedForm } = await import('../modules/data.js');
                body.append(card(title, 'Fiches autorisées du modèle spécialisé.', stack(definition?.canCreate && definition?.genericCreate !== false ? button('Ajouter', { iconName: 'add', onClick: () => specializedForm(kind, null, draw) }) : null, dataTable({ rows: records.map(r => ({ ...r, ...r.data })), name: 'op-' + kind, columns: [{ id: 'title', label: 'Intitulé' }, { id: 'status', label: 'Statut', render: r => statusDot(r.status) }, { id: 'version', label: 'Version' }], onOpen: r => definition?.writable && definition?.genericUpdate !== false ? specializedForm(kind, records.find(v => v.id === r.id), draw) : modal({ title: r.title, wide: true, content: displayValue(records.find(v => v.id === r.id)) }) }))));
            }
            catch (error) {
                body.append(card(kind, '', errorBox(error)));
            }
        }
    };
    root.append(button('Actualiser les fiches', { iconName: 'sync', onClick: draw }), body);
    await draw();
    return root;
}
async function aftercare() {
    const root = stack(), vault = new LocalVault(), project = select('', choices(rows('projects'), 'Sans projet')), reference = input(''), transcript = textarea('', { rows: 7, placeholder: 'Transcription relue ou notes saisies…' }), notes = textarea('', { rows: 5, placeholder: 'Décisions et prochaines actions…' }), preview = stack(), feedbackNode = stack();
    let blob = null, recorder = null, stream = null, timer = null, disposed = false, recordedBytes = 0;
    const saved = await vault.get('aftercare-draft').catch(() => null);
    if (saved) {
        reference.value = saved.reference || '';
        transcript.value = saved.transcript || '';
        notes.value = saved.notes || '';
        project.value = saved.projectID || '';
    }
    const setAudio = async (file) => {
        if (file.size > 25 * 1024 * 1024)
            throw Error('Une note audio est limitée à 25 Mo.');
        blob = file;
        preview.replaceChildren(h('p', { text: file.name || 'Note personnelle' }), button('Écouter dans Workspace', { iconName: 'play', onClick: () => openMedia({ blob, name: file.name || 'note.webm' }) }));
    };
    const stop = () => {
        clearTimeout(timer);
        if (recorder?.state === 'recording')
            recorder.stop();
        stream?.getTracks().forEach(t => t.stop());
        stream = null;
    };
    const record = button('Dicter une note personnelle', { iconName: 'phone', onClick: async () => {
            if (recorder?.state === 'recording') {
                stop();
                return;
            }
            if (!globalThis.MediaRecorder || !navigator.mediaDevices?.getUserMedia)
                throw Error('L’enregistrement du microphone n’est pas disponible dans ce navigateur. Importez un fichier audio.');
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (disposed) {
                stop();
                return;
            }
            const parts = [];
            recordedBytes = 0;
            recorder = new MediaRecorder(stream);
            recorder.ondataavailable = e => {
                parts.push(e.data);
                recordedBytes += e.data.size;
                if (recordedBytes > 25 * 1024 * 1024)
                    stop();
            };
            recorder.onstop = () => {
                record.querySelector('span').textContent = 'Dicter une note personnelle';
                if (!disposed)
                    void setAudio(new File(parts, 'note-' + Date.now() + '.webm', { type: recorder.mimeType })).catch(e => feedbackNode.replaceChildren(errorBox(e)));
            };
            recorder.start(1000);
            record.querySelector('span').textContent = 'Arrêter la note';
            timer = setTimeout(stop, 180000);
        } });
    const importer = input('', { type: 'file' });
    importer.accept = 'audio/*';
    importer.addEventListener('change', () => {
        const file = importer.files?.[0];
        if (file)
            void setAudio(file).catch(e => feedbackNode.replaceChildren(errorBox(e)));
    });
    root.append(notice('Importez uniquement un audio que vous êtes autorisé à utiliser. Le microphone enregistre une note personnelle de trois minutes maximum ; il ne capte pas les voix distantes d’un appel.'), field('Projet', project), field('Référence de l’appel', reference), actions(record, field('Importer un audio', importer)), preview, notice('La transcription locale de fichiers audio utilise Apple Speech dans l’app native. Sur le web, vous pouvez écouter le fichier et saisir ou coller le texte à relire.'), field('Transcription à relire', transcript), field('Suites à donner', notes), actions(button('Conserver le brouillon sur cet appareil', { iconName: 'check', onClick: async () => { await vault.put('aftercare-draft', { reference: reference.value, transcript: transcript.value, notes: notes.value, projectID: project.value }); feedbackNode.replaceChildren(notice('Brouillon chiffré conservé pour ce compte pendant 30 jours.', 'success')); } }), hasAny('manageDocuments') ? button('Préparer le compte rendu', { iconName: 'document', onClick: () => { const doc = blankDoc('page', 'Compte rendu · ' + (reference.value || 'Échange'), project.value || null); doc.content.blocks = [block('heading', 'Notes de l’échange'), block('text', transcript.value), block('heading', 'Suites à donner'), block('text', notes.value)]; editStudio(doc); } }) : null, hasAny('manageTasks') ? button('Préparer un engagement', { iconName: 'add', onClick: () => commitments(notes.value).then(content => modal({ title: 'Engagement à confirmer', content, wide: true })) }) : null, hasAny('manageDocuments') ? button('Conserver l’audio dans Documents', { iconName: 'upload', onClick: async () => {
            if (!blob)
                throw Error('Choisissez ou enregistrez un audio.');
            if (!await confirmDialog({ title: 'Importer cet audio ?', message: 'Il sera conservé dans le périmètre du compte. Vérifiez votre droit à le conserver.' }))
                return;
            const { importDocumentFile } = await import('./evolution.js');
            await importDocumentFile(blob, project.value || null);
            feedbackNode.replaceChildren(notice('Audio importé dans Documents.', 'success'));
        } }) : null), feedbackNode);
    lifecycle(root, () => { disposed = true; stop(); blob = null; });
    return root;
}
async function offline() {
    const root = stack(), vault = new LocalVault(), list = stack(), chosen = new Set(), feedbackNode = stack(), docs = rows('documents').filter(d => d.storageKey);
    const fingerprint = d => [d.storageKey, d.modifiedAt, d.byteCount].join(':');
    const draw = async () => {
        list.replaceChildren();
        for (const entry of (await vault.list()).filter(v => v.id.startsWith('file:'))) {
            const current = docs.find(d => 'file:' + d.id === entry.id);
            list.append(card(entry.title, 'Copie du ' + formatDate(entry.savedAt) + ' · expire le ' + formatDate(entry.expiresAt), stack(current && fingerprint(current) !== entry.fingerprint ? notice('Une version plus récente est disponible. Préparez à nouveau cette copie.', 'warning') : null, actions(button('Ouvrir la copie', { iconName: 'search', disabled: !current, onClick: async () => {
                    if (!rows('documents').some(d => 'file:' + d.id === entry.id))
                        throw Error('Ce document ne fait plus partie de votre périmètre.');
                    return openMedia({ blob: new Blob([decodeBytes((await vault.get(entry.id)).bytes)], { type: entry.type }), name: entry.name });
                } }), button('Retirer la copie locale', { iconName: 'trash', onClick: async () => { await vault.remove(entry.id); await draw(); } })))));
        }
    };
    root.append(notice('Copies choisies, chiffrées sur ce navigateur, expiration à 30 jours, 25 Mo par fichier. Les changements de droits ne sont reçus qu’à la reconnexion. L’accès web nécessite une session et un espace déjà chargés ; cette page ne rend pas toute l’application utilisable hors connexion.'), dataTable({ rows: docs, name: 'offline-choices', columns: [{ id: 'title', label: 'Document' }, { id: 'byteCount', label: 'Octets' }], selectionActions: selected => [{ label: 'Conserver ' + selected.length + ' copie(s)', icon: 'download', run: async () => {
                    let count = 0;
                    for (const doc of selected) {
                        if (Number(doc.byteCount) > 25 * 1024 * 1024)
                            throw Error(doc.title + ' dépasse 25 Mo.');
                        const blob = await fileBlob(doc.storageKey);
                        if (blob.size > 25 * 1024 * 1024)
                            throw Error('Copie trop volumineuse.');
                        await vault.put('file:' + doc.id, { title: doc.title, name: doc.originalFileName || doc.title, type: blob.type, bytes: encodeBytes(await blob.arrayBuffer()), savedAt: new Date().toISOString(), fingerprint: fingerprint(doc) });
                        count++;
                        feedbackNode.replaceChildren(notice(count + ' copie(s) préparée(s).', 'success'));
                    }
                    await draw();
                } }] }), feedbackNode, h('h2', { text: 'Copies de ce compte' }), list);
    await draw();
    return root;
}
async function repair() {
    const root = stack(notice('Les observations signalent des points à examiner. Les corrections passent par les dossiers et leurs contrôles de version.'), button('Ouvrir le centre d’import', { iconName: 'upload', onClick: () => setRoute('documents', 'imports') }));
    if (hasAny('manageOrganization')) {
        const data = await call('/v1/workflows/operations/quality');
        root.append(dataTable({ rows: data.issues || [], name: 'data-repair', columns: [{ id: 'title', label: 'Observation' }, { id: 'count', label: 'Éléments' }, { id: 'detail', label: 'Détail' }, { id: 'state', label: 'État' }], onOpen: r => {
                const section = sourceRoutes[r.domain] || r.domain;
                if (canAccessSection(section, state.user))
                    setRoute(section);
            } }));
    }
    else
        root.append(notice('La vue de qualité globale est réservée à la gestion de l’organisation. Vos dossiers et imports conservent leurs propres erreurs.'));
    return root;
}
async function deliveries() { const root = stack(card('Version web observée', document.querySelector('meta[name="sq-release"]')?.content || 'Version non fournie par cette page.', notice('Cette valeur identifie les sources servies au navigateur. Elle ne confirme pas la version installée sur les autres appareils.'))); const delivery = await call('/v1/workflows/operations/delivery'); root.append(card('Serveur observé', 'Lecture du ' + formatDate(delivery.generatedAt), displayValue(delivery)), await recordTable(['product-versions', 'product-releases'])); return root; }
async function review() {
    const root = stack(), project = select('', choices(rows('projects'), 'Choisir un projet')), body = stack(), draw = async () => {
        body.replaceChildren();
        if (!project.value)
            return;
        body.append(dataTable({ rows: rows('deliverables').filter(d => d.projectID === project.value), name: 'review-deliverables', columns: [{ id: 'title', label: 'Livrable' }, { id: 'version', label: 'Version' }, { id: 'status', label: 'Statut', render: r => statusDot(r.status) }], onOpen: r => setRoute('deliverables', '', r.id) }), await studioLibrary({ kind: 'portal', projectID: project.value }));
    };
    project.addEventListener('change', () => void draw().catch(e => body.replaceChildren(errorBox(e))));
    root.append(notice('La revue reste liée à la version du livrable. Un lien client est créé explicitement depuis son espace de partage.'), field('Projet', project), body);
    return root;
}
async function inbox() {
    const prefs = new PrivatePreferences('operations.inbox.v1'), saved = await prefs.load({}), root = stack(), body = stack(), feedbackNode = stack(), filter = select('open', [{ value: 'open', label: 'À examiner' }, { value: 'done', label: 'Examinés dans cette boîte' }, { value: 'all', label: 'Tout' }]), owner = state.user.id;
    let items = [], approvalCursor = null;
    const signature = item => item.title + '|' + item.detail + '|' + (item.dueAt || '');
    const load = async (more = false) => {
        if (!more)
            items = [...rows('tasks').filter(t => !closed(t.status) && (t.assigneeID === owner || hasAny('manageTasks'))).map(t => ({ id: 'task:' + t.id.toUpperCase(), title: t.title, family: 'Tâches', detail: statusLabel(t.status) + ' · ' + (t.mission || ''), dueAt: t.dueAt || '', open: () => setRoute('tasks', '', t.id) })), ...(hasAny('decideValidations') ? rows('validations').filter(t => ['pending', 'review', 'validation'].includes(t.status)).map(t => ({ id: 'validation:' + t.id.toUpperCase(), title: t.title, family: 'Validations', detail: (t.project || '') + ' · ' + statusLabel(t.status), dueAt: t.dueAt || '', open: () => setRoute('validations', '', t.id) })) : []), ...rows('conversations').filter(t => Number(t.unread) > 0).map(t => ({ id: 'conversation:' + t.id.toUpperCase(), title: t.name, family: 'Messages', detail: t.unread + ' non-lu(s)', dueAt: '', open: () => setRoute('messages', '', t.id) }))];
        try {
            const data = await call('/v1/operations/approvals' + (more && approvalCursor ? '?cursor=' + encodeURIComponent(approvalCursor) : ''));
            for (const request of data.items || []) {
                if (request.state !== 'pending' || !request.steps?.[request.currentStep]?.reviewerIDs?.includes(owner))
                    continue;
                const row = { id: 'approval:' + request.id, title: request.title, family: 'Approbations', detail: 'Étape ' + (request.currentStep + 1) + ' · version ' + request.version, dueAt: '', open: () => setRoute('activity', 'op-approvals') };
                if (!items.some(v => v.id === row.id))
                    items.push(row);
            }
            approvalCursor = data.nextCursor;
            feedbackNode.replaceChildren();
        }
        catch (error) {
            feedbackNode.replaceChildren(errorBox(error));
        }
        draw();
    };
    const draw = () => {
        const reviewed = row => saved[row.id] === signature(row);
        body.replaceChildren(dataTable({ rows: items.filter(v => filter.value === 'all' || (filter.value === 'done' ? reviewed(v) : !reviewed(v))), name: 'unified-inbox', columns: [{ id: 'title', label: 'À examiner' }, { id: 'family', label: 'Source' }, { id: 'detail', label: 'Contexte' }], onOpen: v => v.open(), actions: v => [{ label: reviewed(v) ? 'Remettre à examiner' : 'Marquer examiné dans cette boîte', icon: 'check', run: async () => {
                        const next = { ...saved };
                        if (reviewed(v))
                            delete next[v.id];
                        else
                            next[v.id] = signature(v);
                        await prefs.save(next);
                        for (const key of Object.keys(saved))
                            delete saved[key];
                        Object.assign(saved, next);
                        draw();
                    } }] }));
        if (approvalCursor)
            body.append(button('Charger d’autres approbations', { iconName: 'add', onClick: () => load(true) }));
    };
    filter.addEventListener('change', draw);
    root.append(notice('Le classement personnel de cette boîte ne clôture aucune tâche et ne valide aucune décision. Une fiche modifiée revient à examiner.'), actions(field('Afficher', filter), button('Actualiser', { iconName: 'sync', onClick: () => load(false) }), hasAny('viewMail') ? button('Ouvrir les e-mails', { iconName: 'mail', onClick: () => setRoute('mailbox') }) : null), feedbackNode, body);
    await load();
    return root;
}
function statusLabel(value) { return ({ active: 'Actif', completed: 'Terminé', pending: 'En attente', review: 'En révision', validation: 'En validation', inProgress: 'En cours', production: 'En production', planned: 'Planifié', blocked: 'Bloqué', urgent: 'Urgent', approved: 'Approuvé', rejected: 'Refusé', cancelled: 'Annulé' })[value] || String(value || ''); }
async function relationships() {
    const catalog = await call('/v1/workflows/pilotage/catalog'), root = stack(), selector = select('', [{ value: '', label: 'Choisir un contexte' }, ...(catalog.lenses || []).map(l => ({ value: l.id, label: l.title }))]), body = stack();
    let collected;
    const draw = () => {
        const byKey = new Map(collected.nodes.map(n => [n.key.toLowerCase(), n])), links = collected.nodes.flatMap(n => (n.refs || []).map(ref => ({ id: n.key + ':' + ref.kind + ':' + ref.id, from: n.title, relation: ref.relation || 'lié à', to: byKey.get((ref.kind + ':' + ref.id).toLowerCase())?.title || 'Référence hors de la sélection chargée', source: n })));
        body.replaceChildren(notice(collected.nodes.length + ' fiches chargées · ' + links.length + ' relations visibles. Les sources paginées et les droits limitent cette vue.'), ...collected.failures.map(f => notice(f.kind + ' : ' + f.message, 'warning')), h('div', { class: 'sq-relationship-map' }, ...collected.nodes.map(n => button(n.title, { iconName: 'document', onClick: () => openSource(n) }))), dataTable({ rows: links, name: 'relationships', columns: [{ id: 'from', label: 'Source' }, { id: 'relation', label: 'Relation' }, { id: 'to', label: 'Destination' }], onOpen: r => openSource(r.source) }));
        if (collected.pending.length)
            body.append(button('Charger les sources suivantes', { iconName: 'add', onClick: async () => {
                    const pending = collected.pending.splice(0);
                    for (const page of pending) {
                        const data = await call('/v1/workflows/pilotage/sources?' + new URLSearchParams({ lens: collected.lens.id, kind: page.kind, cursor: page.cursor }));
                        collected.nodes.push(...(data.items || []).filter(n => !byKey.has(n.key.toLowerCase())));
                        if (data.nextCursor)
                            collected.pending.push({ kind: page.kind, cursor: data.nextCursor });
                    }
                    draw();
                } }));
    };
    selector.addEventListener('change', () => {
        if (selector.value)
            void pilotageSources(selector.value).then(result => { collected = result; draw(); }).catch(e => body.replaceChildren(errorBox(e)));
    });
    root.append(field('Contexte', selector), body);
    return root;
}
async function desks() {
    const preferences = new PrivatePreferences('operations.desks.v1'), values = await preferences.load([]), root = stack(), list = stack(), title = input('', { placeholder: 'Nom de votre espace' }), section = select('', [{ value: '', label: 'Choisir un module' }, ...Object.entries(SECTIONS).filter(([id]) => canAccessSection(id, state.user)).map(([value, meta]) => ({ value, label: meta.title }))]), page = select('', []), query = input('', { placeholder: 'Recherche à restaurer' });
    let selectedID = '';
    const webPage = link => (SECTIONS[link.section]?.subpages || []).find(p => p.id === link.pageID || p.nativeID === link.pageID);
    const choosePage = () => { page.replaceChildren(...[{ value: '', label: 'Vue principale' }, ...(SECTIONS[section.value]?.subpages || []).filter(p => canAccessSubpage(p, state.user)).map(p => ({ value: p.id, label: p.title }))].map(v => h('option', { value: v.value, text: v.label }))); };
    section.addEventListener('change', choosePage);
    choosePage();
    const persist = async (next) => { await preferences.save(next); values.splice(0, values.length, ...next); draw(); };
    const draw = () => {
        list.replaceChildren(...values.map(desk => card(desk.title, desk.id === selectedID ? 'Espace sélectionné' : '', stack(actions(button('Choisir', { iconName: 'grid', onClick: () => { selectedID = desk.id; title.value = desk.title; draw(); } }), button('Supprimer l’espace', { iconName: 'trash', onClick: async () => {
                if (await confirmDialog({ title: 'Supprimer cet espace mémorisé ?', message: 'Les dossiers qu’il référence seront conservés.', danger: true }))
                    await persist(values.filter(v => v.id !== desk.id));
            } })), ...(desk.links || []).map(link => actions(button(link.title, { iconName: 'document', disabled: !canAccessSection(link.section, state.user) || !!link.pageID && (!webPage(link) || !canAccessSubpage(webPage(link), state.user)), onClick: () => {
                setRoute(link.section, webPage(link)?.id || '');
                if (link.search)
                    void import('../focus-search.js').then(({ openFocusSearch }) => openFocusSearch({ initialQuery: link.search }));
            } }), button('Retirer ce raccourci', { iconName: 'close', onClick: () => persist(values.map(v => v.id === desk.id ? { ...v, links: v.links.filter(l => l.id !== link.id) } : v)) })))))));
    };
    root.append(field('Nom de l’espace', title), actions(button('Créer un espace', { iconName: 'add', onClick: async () => {
            if (!title.value.trim())
                throw Error('Donnez un nom à cet espace.');
            const next = { id: uid(), title: title.value.trim(), links: [] };
            selectedID = next.id;
            await persist([...values, next]);
        } }), button('Renommer l’espace sélectionné', { iconName: 'edit', onClick: async () => {
            if (!selectedID || !title.value.trim())
                throw Error('Choisissez un espace et renseignez son nom.');
            await persist(values.map(v => v.id === selectedID ? { ...v, title: title.value.trim() } : v));
        } })), field('Module', section), field('Page', page), field('Recherche à restaurer', query), button('Mémoriser cette page', { iconName: 'add', onClick: async () => {
            if (!selectedID || !section.value)
                throw Error('Choisissez un espace et un module.');
            await persist(values.map(v => v.id === selectedID ? { ...v, links: [...(v.links || []), { id: uid(), title: SECTIONS[section.value].title + (page.value ? ' · ' + page.selectedOptions[0].textContent : ''), section: section.value, pageID: (SECTIONS[section.value]?.subpages || []).find(p => p.id === page.value)?.nativeID || page.value || null, search: query.value }] } : v));
        } }), list);
    draw();
    return root;
}
export async function commitments(initialExcerpt = '') {
    const root = stack(), excerpt = textarea(initialExcerpt, { rows: 6, placeholder: 'Copiez l’extrait de l’échange qui vous autorise à préparer cette action…' }), reference = input('', { placeholder: 'Conversation, e-mail ou compte rendu' }), source = select('message', [{ value: 'message', label: 'Message' }, { value: 'mail', label: 'E-mail' }, { value: 'meeting', label: 'Compte rendu' }, { value: 'other', label: 'Autre' }]);
    root.append(notice('Relisez l’extrait avant de créer une tâche. Aucune action n’est déduite ou attribuée automatiquement.'), field('Origine', source), field('Référence de l’échange', reference), field('Extrait à confirmer', excerpt), hasAny('manageTasks') ? button('Préparer la tâche', { iconName: 'add', kind: 'primary', onClick: async () => {
            if (!excerpt.value.trim())
                throw Error('Saisissez un extrait.');
            const { editRecord } = await import('../focus-records.js');
            editRecord('tasks', null, async () => { }, { title: excerpt.value.trim().split('\n')[0].slice(0, 160), description: 'Origine : ' + source.selectedOptions[0].textContent + ' · ' + reference.value + '\n\n' + excerpt.value });
        } }) : notice('La création d’un engagement demande le droit de gérer les tâches.'));
    return root;
}
async function brands() { return stack(await recordTable(['brands', 'brand-contents', 'brand-channels']), h('h2', { text: 'Guides d’usage' }), await studioLibrary({ category: 'brand-guidelines', title: 'Guide de marque', template: ['Positionnement et ton', 'Logos et variantes', 'Couleurs et typographie', 'Exemples d’utilisation', 'Droits, responsables et révision'] })); }
async function access() {
    const root = stack(), member = select('', choices(rows('team'), 'Choisir un membre')), body = stack();
    root.append(notice('Lecture des droits effectifs. Cette vue ne modifie aucun rôle ou accès.'), field('Membre', member), button('Lire les accès effectifs', { iconName: 'shield', onClick: async () => {
            if (!member.value)
                throw Error('Choisissez un membre.');
            const data = await call('/v1/members/' + member.value + '/effective-access');
            body.replaceChildren(displayValue(data));
        } }), body);
    return root;
}
async function recovery() {
    const root = stack(), docs = await listStudio('page'), choice = select('', choices(docs, 'Choisir une page')), body = stack();
    root.append(notice('Les blocs et champs choisis sont repris dans une nouvelle version. Les accès et les partages restent ceux du document actuel.'), field('Page', choice), button('Lire l’historique', { iconName: 'clock', onClick: async () => {
            const doc = (await listStudio('page')).find(d => d.id === choice.value);
            if (!doc)
                throw Error('Choisissez une page disponible.');
            body.replaceChildren(await historyPanel(doc, async (saved) => body.replaceChildren(await historyPanel(saved))));
        } }), body, button('Ouvrir la corbeille centralisée', { iconName: 'trash', onClick: () => setRoute('trash') }));
    return root;
}
async function presentation() {
    const root = stack(), title = input('Revue du projet'), summary = textarea('', { rows: 5 }), milestones = textarea('', { rows: 5 });
    root.append(field('Titre destiné à votre audience', title), field('Résumé', summary), field('Jalons, un par ligne', milestones), notice('Seuls ces trois champs seront montrés. Relisez-les avant de partager votre écran. Les notifications du système et les autres fenêtres restent sous votre contrôle.', 'warning'), button('Examiner et présenter', { iconName: 'lock', kind: 'primary', onClick: async () => {
            if (!title.value.trim())
                throw Error('Renseignez le titre.');
            if (!await confirmDialog({ title: 'Contenu prêt pour votre audience ?', message: 'Vérifiez le titre, le résumé et les jalons avant d’ouvrir la présentation.' }))
                return;
            const prior = document.activeElement, app = document.querySelector('#app'), portal = document.querySelector('#portal-root'), oldInert = app?.inert, oldHidden = app?.getAttribute('aria-hidden'), oldPortalHidden = portal?.hidden, cover = h('section', { class: 'sq-confidential-cover', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Présentation Workspace', tabindex: '-1' });
            const close = () => {
                cover.remove();
                if (app) {
                    app.inert = oldInert;
                    if (oldHidden === null)
                        app.removeAttribute('aria-hidden');
                    else
                        app.setAttribute('aria-hidden', oldHidden);
                }
                if (portal)
                    portal.hidden = oldPortalHidden;
                window.removeEventListener('keydown', keys, true);
                stopWatch();
                if (prior?.isConnected)
                    prior.focus();
            };
            const keys = e => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                }
                else if (e.key === 'Tab') {
                    e.preventDefault();
                    cover.querySelector('button').focus();
                }
            };
            const owner = scope(), stopWatch = subscribe(() => {
                if (scope() !== owner)
                    close();
            });
            cover.append(h('header', {}, h('strong', { text: 'Squared Workspace' }), button('Quitter la présentation', { iconName: 'close', onClick: close })), h('h1', { text: title.value }), h('p', { class: 'sq-presentation-summary', text: summary.value }), ...milestones.value.split('\n').filter(v => v.trim()).map(text => h('div', { class: 'sq-presentation-milestone', text })));
            if (app) {
                app.inert = true;
                app.setAttribute('aria-hidden', 'true');
            }
            if (portal)
                portal.hidden = true;
            document.body.append(cover);
            window.addEventListener('keydown', keys, true);
            cover.focus();
        } }));
    return root;
}
async function glossary() { const terms = [['Projet', 'Dossier réunissant objectif, équipe, calendrier et budget.'], ['Mission', 'Partie d’un projet confiée à un responsable avec un résultat attendu.'], ['Tâche', 'Action attribuée ; sa clôture relève du parcours de cette tâche.'], ['Livrable', 'Résultat versionné remis pour revue ou livraison.'], ['Validation', 'Décision explicite sur une version. Lire un document ne vaut pas approbation.'], ['Archiver', 'Retirer des vues actives en conservant l’historique.'], ['Corbeille', 'Éléments supprimés logiquement, soumis aux droits, références et rétentions.'], ['Rétention', 'Durée ou obligation empêchant une suppression définitive.'], ['Engagement', 'Action à confirmer avec un responsable et une échéance.'], ['Version observée', 'Version réellement lue sur la source ; elle diffère d’une version déclarée.'], ['Source chargée', 'Partie des données autorisées déjà récupérée.'], ['Scénario', 'Hypothèses de décision distinctes des résultats et écritures.']]; return stack(dataTable({ rows: terms.map(([title, definition]) => ({ id: title, title, definition })), name: 'glossary', columns: [{ id: 'title', label: 'Terme' }, { id: 'definition', label: 'Définition' }] }), await studioLibrary({ category: 'glossary', title: 'Définition métier', template: ['Terme et définition', 'Exemples et contre-exemples', 'Source de référence', 'Responsable et révision'] })); }
async function sandbox() {
    const rules = await listSpecialized('automation-definitions'), rule = select('', choices(rules, 'Choisir une règle')), title = input('Événement fictif'), status = input('submitted'), amount = input('0', { type: 'number' }), severity = select('medium', ['low', 'medium', 'high', 'critical'].map(value => ({ value, label: value }))), body = stack();
    return stack(notice('L’aperçu n’exécute aucune action, aucun envoi et aucun paiement.'), field('Règle enregistrée', rule), field('Titre fictif', title), field('Statut fictif', status), field('Montant fictif', amount), field('Sévérité fictive', severity), button('Prévisualiser la règle', { iconName: 'search', onClick: async () => {
            if (!rule.value)
                throw Error('Choisissez une règle.');
            const data = await call('/v1/workflows/automations/' + rule.value + '/preview', { method: 'POST', body: { input: { title: title.value, status: status.value, amount: Number(amount.value), severity: severity.value } } });
            body.replaceChildren(displayValue(data));
        } }), body);
}
async function assistant() {
    const catalog = await call('/v1/workflows/pilotage/catalog'), root = stack(notice('L’assistant natif s’appuie sur Apple Foundation Models, absent du navigateur. Préparez ici une sélection explicite de références et une note à relire, sans génération ni envoi à un modèle externe.')), context = select('', [{ value: '', label: 'Choisir un contexte' }, ...(catalog.lenses || []).map(l => ({ value: l.id, label: l.title }))]), body = stack(), instruction = textarea('', { rows: 4, placeholder: 'Question ou note à préparer…' });
    let selection = [];
    root.append(field('Contexte', context), field('Question ou note personnelle', instruction), button('Charger les références autorisées', { iconName: 'sync', onClick: async () => {
            if (!context.value)
                throw Error('Choisissez un contexte.');
            const data = await pilotageSources(context.value);
            selection = [];
            body.replaceChildren(notice('La sélection est limitée à 30 références parmi les sources chargées.'), dataTable({ rows: data.nodes.map(n => ({ ...n, id: n.key })), name: 'assistant-context', columns: [{ id: 'title', label: 'Référence' }, { id: 'kind', label: 'Source' }, { id: 'version', label: 'Version' }], onSelectionChange: rows => { selection = rows; } }), ...data.failures.map(e => notice(e.message, 'warning')));
        } }), body, hasAny('manageDocuments') ? button('Préparer la note avec ces références', { iconName: 'document', onClick: () => {
            if (!selection.length || selection.length > 30)
                throw Error('Sélectionnez entre 1 et 30 références.');
            const doc = blankDoc('page', 'Note contextualisée');
            doc.content.blocks = [block('heading', 'Question ou note personnelle'), block('text', instruction.value), block('heading', 'Références explicitement sélectionnées'), ...selection.map(n => block('text', n.title + ' · ' + n.kind + ' · version ' + n.version + ' · ' + n.key))];
            editStudio(doc);
        } }) : null);
    return root;
}
async function incident() { return stack(await recordTable(['product-incidents', 'tickets']), await studioLibrary({ category: 'incident-room', title: 'Salle d’incident', template: ['Périmètre et impact constaté', 'Chronologie et faits', 'Responsables et actions', 'Communication autorisée', 'Retour au service et preuves', 'Causes et prévention'] })); }
