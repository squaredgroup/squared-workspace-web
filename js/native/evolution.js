import { state, setRoute, h, button, field, input, select, textarea, card, emptyState, toast, modal, hasAny, scope, statusDot, confirmDialog, call, rows, choices, stack, actions, notice, toggle, uid, clone, blankDoc, listStudio, saveDoc, errorBox } from './operation-kit.js';
import { dataTable, displayValue, downloadBlob } from './components.js';
import { pageHeader, formatDate } from '../ui.js';
import { canAccessSection } from '../config.js';
import { listSpecialized, saveCoreEntity, uploadFile, loadWorkspace } from '../api.js';
import { renderGroup, renderDossiers } from './dossiers.js';
import { contracts, openOperation, renderWorkflowGroup } from './workflows.js';
import { studioLibrary, editStudio } from './studio.js';
import { LocalVault } from './offline-vault.js';
export async function importDocumentFile(file, projectID = null) {
    if (!hasAny('manageDocuments'))
        throw Error('L’import dans Documents demande le droit de gérer les fichiers.');
    const doc = await saveCoreEntity('documents', { title: file.name || 'Note audio', status: 'active', payload: { type: file.type || 'Fichier', ...(projectID ? { projectID } : {}) } }), upload = await uploadFile(file, 'document', doc.id);
    return saveCoreEntity('documents', { ...doc, payload: { ...doc.payload, storageKey: upload.id, mediaType: upload.mediaType, byteCount: file.size, originalFileName: file.name || 'note.webm' } });
}
export async function importCenter() {
    const root = stack(pageHeader({ eyebrow: 'Données et fichiers', title: 'Centre d’import', subtitle: 'Retrouvez les sessions, leurs points de reprise et les imports par source.' })), jobs = stack(), feedback = stack(), catalog = await contracts(), vault = new LocalVault();
    let items = [];
    const reload = async () => { const data = await call('/v1/workflows/imports'); items = data.items || []; jobs.replaceChildren(dataTable({ rows: items, name: 'import-jobs', columns: [{ id: 'title', label: 'Session' }, { id: 'target', label: 'Destination' }, { id: 'state', label: 'État', render: r => statusDot(r.state) }, { id: 'imported', label: 'Confirmés' }, { id: 'totalRows', label: 'Total' }, { id: 'error', label: 'Blocage' }, { id: 'updatedAt', label: 'Dernier point de reprise', value: r => formatDate(r.updatedAt) }], onOpen: inspect, actions: r => [{ label: 'Point de reprise et actions', icon: 'document', run: () => inspect(r) }] })); };
    const operation = (path, method, context, reload) => {
        const op = catalog.operations.find(o => o.path === path && o.method === method);
        if (!op)
            throw Error('Ce parcours n’est pas disponible sur cette version.');
        return openOperation(op, { context, onComplete: reload });
    };
    const inspect = async (job) => {
        let current = (await call('/v1/workflows/imports/' + job.id)).job;
        const body = stack(), paint = () => {
            body.replaceChildren(displayValue(current), notice('Les lots déjà appliqués sont conservés. Une annulation ne les efface pas.'));
            if (current.state === 'preparing')
                body.append(button('Reprendre la transmission du fichier préparé', { iconName: 'upload', onClick: async () => {
                        const draft = await vault.get('import:' + job.id);
                        if (!draft)
                            throw Error('Le contenu original n’est pas disponible dans ce navigateur. Réimportez le fichier avec le même identifiant de session.');
                        current = await sendBatches(current, draft.rows);
                        paint();
                        await reload();
                    } }));
            if (['ready', 'running', 'failed'].includes(current.state))
                body.append(button('Confirmer le lot suivant', { iconName: 'check', onClick: () => operation('/v1/workflows/imports/:id/commit-next', 'POST', { id: current.id, batchIndex: current.appliedBatches }, async () => { current = (await call('/v1/workflows/imports/' + job.id)).job; paint(); await reload(); }) }));
            if (current.state === 'failed')
                body.append(button('Examiner le lot refusé', { iconName: 'search', onClick: () => operation('/v1/workflows/imports/:id/failed-batch', 'GET', { id: current.id }) }), button('Préparer une réparation liée', { iconName: 'edit', onClick: () => operation('/v1/workflows/imports/:id/repair', 'POST', { id: current.id, batchIndex: current.failedBatch }, reload) }));
            if (!['completed', 'cancelled'].includes(current.state))
                body.append(button('Annuler les lots restants', { iconName: 'close', onClick: async () => {
                        if (!await confirmDialog({ title: 'Annuler la suite de cet import ?', message: current.imported + ' éléments déjà confirmés resteront conservés.' }))
                            return;
                        current = (await call('/v1/workflows/imports/' + current.id + '/cancel', { method: 'POST', body: { confirmed: true } })).job;
                        paint();
                        await reload();
                    } }));
        };
        paint();
        modal({ title: 'Session · ' + job.title, wide: true, content: body });
    };
    async function sendBatches(job, records) {
        let current = job;
        for (let index = current.uploadedBatches; index < Math.ceil(records.length / current.batchSize); index++) {
            current = (await call('/v1/workflows/imports/' + current.id + '/batches/' + index, { method: 'PUT', body: { rows: records.slice(index * current.batchSize, (index + 1) * current.batchSize) } })).job;
            feedback.replaceChildren(notice(current.uploadedBatches + ' lot(s) reçus. L’application aux dossiers attend votre confirmation.'));
        }
        return current;
    }
    const prepare = async () => {
        const targets = await call('/v1/workflows/import-catalog'), allowedCore = [['clients', 'Clients', 'manageClients'], ['projects', 'Projets', 'manageProjects'], ['tasks', 'Tâches', 'manageTasks']].filter(([, , permission]) => hasAny(permission)).map(([value, label]) => ({ value, label })), target = select('', [{ value: '', label: 'Choisir une destination' }, ...allowedCore, ...(targets.targets || []).map(t => ({ value: t.target, label: t.title }))]), file = input('', { type: 'file' }), title = input('Import préparé'), sessionID = input(uid()), detail = stack();
        file.accept = '.json,application/json';
        let records = null;
        file.addEventListener('change', async () => {
            try {
                if (!file.files?.[0])
                    return;
                if (file.files[0].size > 20 * 1024 * 1024)
                    throw Error('Le fichier de préparation dépasse 20 Mo.');
                const parsed = JSON.parse(await file.files[0].text());
                records = Array.isArray(parsed) ? parsed : parsed.rows;
                if (!Array.isArray(records) || !records.length || records.length > 50000)
                    throw Error('Le fichier doit contenir entre 1 et 50 000 lignes.');
                if (records.some(r => !r.id || !r.payload || typeof r.payload !== 'object'))
                    throw Error('Chaque ligne doit contenir id, title, status, parentID, expected et payload, et, pour une mise à jour, ses contrôles de version.');
                detail.replaceChildren(notice(records.length + ' ligne(s) préparée(s). Aucun dossier n’a encore été créé.'), dataTable({ rows: records.slice(0, 25).map(r => ({ ...r, title: r.payload.title || r.payload.name || r.id })), name: 'import-preview', columns: [{ id: 'title', label: 'Aperçu des 25 premières lignes' }, { id: 'id', label: 'Référence' }] }));
            }
            catch (error) {
                records = null;
                detail.replaceChildren(errorBox(error));
            }
        });
        modal({ title: 'Préparer un import avec reprise', wide: true, content: stack(notice('Format JSON de préparation : un tableau de lignes { id, title, status, parentID, expected, payload }. Pour les mises à jour, les identités et versions d’origine doivent être conservées. Les modèles importables sont fournis par le serveur.'), field('Destination', target), field('Titre', title), field('Identifiant de session à conserver pour la reprise', sessionID), field('Fichier préparé', file), detail), actions: [{ label: 'Transmettre le plan', icon: 'upload', kind: 'primary', onClick: async (close) => {
                        if (!records || !target.value)
                            throw Error('Choisissez la destination et le fichier.');
                        if (!await confirmDialog({ title: 'Transmettre ces ' + records.length + ' lignes ?', message: 'Le plan sera préparé sur le serveur. Les lots métier demandent ensuite une confirmation distincte.' }))
                            return;
                        const job = (await call('/v1/workflows/imports', { method: 'POST', body: { id: sessionID.value, target: target.value, totalRows: records.length, title: title.value } })).job;
                        await vault.put('import:' + job.id, { rows: records, target: target.value, title: title.value });
                        await sendBatches(job, records);
                        close();
                        await reload();
                    } }] });
    };
    root.append(actions(button('Préparer un import de fiches', { iconName: 'add', kind: 'primary', onClick: prepare }), button('', { iconName: 'sync', ariaLabel: 'Actualiser les imports', onClick: reload }), hasAny('manageDocuments') ? button('Importer des fichiers ou dossiers', { iconName: 'folder', onClick: () => setRoute('documents', 'files') }) : null, hasAny('manageTeam') ? button('Importer dans Communication', { iconName: 'image', onClick: () => setRoute('communications') }) : null), feedback, jobs, h('h2', { text: 'Imports spécialisés' }));
    for (const [group, title] of [['catalog_imports', 'Catalogue métier'], ['historical_imports', 'Historique calendrier et mail'], ['cms_imports', 'Contenus des sites']]) {
        const ops = catalog.operations.filter(o => o.group === group);
        if (ops.length)
            root.append(card(title, 'Les validations et droits de cette source sont conservés.', button('Ouvrir les parcours', { iconName: 'upload', onClick: async () => modal({ title, wide: true, content: await renderWorkflowGroup(group) }) })));
    }
    await reload();
    return root;
}
export async function synchronization() {
    const root = stack(pageHeader({ eyebrow: 'Fiabilité', title: 'Synchronisation', subtitle: 'État des sources et des confirmations du compte connecté.' })), body = stack();
    const draw = () => {
        body.replaceChildren(card('Workspace', state.online ? 'Connexion réseau disponible' : 'Navigateur hors connexion', stack(h('p', { text: 'Dernière confirmation : ' + (state.lastSyncAt ? formatDate(state.lastSyncAt) : 'aucune confirmation dans cette session') }), h('p', { text: 'Révision : ' + String(state.workspace?.revision ?? state.workspaceEtag ?? 'non fournie') }), button('Relire le Workspace', { iconName: 'sync', onClick: async () => { await loadWorkspace(); draw(); } }))), card('Imports', 'Les écritures non confirmées restent dans leur session d’import.', button('Ouvrir le centre d’import', { iconName: 'upload', onClick: () => setRoute('documents', 'imports') })), card('Communication et Documents', 'Lecture à l’ouverture de leur explorateur.', actions(button('Fichiers', { iconName: 'folder', onClick: () => setRoute('documents') }), button('Communication', { iconName: 'image', onClick: () => setRoute('communications') }))), notice('Une connexion réseau disponible ne prouve pas la confirmation d’une écriture. Les erreurs de version restent visibles dans le formulaire qui les a reçues.'));
    };
    draw();
    root.append(body);
    return root;
}
export async function gettingStarted() {
    let document = (await listStudio('view')).filter(d => !d.shared && d.ownerID === state.user.id && d.content?.viewScope === 'workspace-onboarding:v1').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const root = stack(pageHeader({ eyebrow: 'Votre espace', title: 'Prise en main', subtitle: 'Un parcours adapté à votre rôle et à vos droits.' })), body = stack(), steps = [['profile', 1, 'Renseigner mon profil', 'profile', ''], ['overview', 2, 'Comprendre mon espace', 'dashboard', '']];
    const add = (id, index, title, section, page = '') => {
        if (canAccessSection(section, state.user))
            steps.push([id, index, title, section, page]);
    };
    if (String(state.user.role).toUpperCase() === 'CLIENT') {
        add('client', 3, 'Consulter mon dossier client', 'dashboard', 'client-portal');
        add('client-exchanges', 4, 'Contacter l’équipe', 'messages');
    }
    else {
        add('project', 5, 'Retrouver mon premier projet', 'projects');
        add('tasks', 6, 'Organiser mes prochaines actions', 'tasks');
        if (hasAny('manageDocuments'))
            add('files', 7, 'Classer les fichiers et documenter une méthode', 'resources', 'wiki');
    }
    if (hasAny('manageOrganization')) {
        add('organization', 8, 'Définir l’organisation et ses pôles', 'businessUnits');
        add('access', 9, 'Vérifier les membres et leurs accès', 'team');
        add('products', 10, 'Relier les produits à leurs sources', 'dashboard', 'product-sources');
    }
    if (hasAny('viewFinance'))
        add('finance', 11, 'Préparer les repères financiers', 'finance');
    if (hasAny('manageCMS'))
        add('cms', 12, 'Vérifier les contenus et les publications', 'siteSystem');
    if (hasAny('manageAutomations'))
        add('automation', 13, 'Relire les automatisations', 'automations');
    if (hasAny('manageOrganization'))
        add('recovery', 14, 'Préparer une récupération', 'settings', 'operations');
    const key = index => 'f9232d98-d865-4f77-9c92-' + String(index).padStart(12, '0'), draw = () => {
        const done = steps.filter(([, index]) => document?.content.values[key(index)]).length;
        body.replaceChildren(notice(done + ' étape(s) confirmée(s) sur ' + steps.length), ...steps.map(([id, index, title, section, page]) => card(title, document?.content.values[key(index)] ? 'Confirmé le ' + formatDate(document.content.values[key(index)]) : 'À examiner', actions(button('Ouvrir', { iconName: 'ArrowRight', onClick: () => setRoute(section, page) }), button(document?.content.values[key(index)] ? 'Rouvrir cette étape' : 'Confirmer cette étape', { iconName: 'check', onClick: async () => {
                let next = document ? clone(document) : blankDoc('view', 'Ma prise en main');
                if (!document) {
                    const user = state.user, seed = 'squared.workspace.onboarding.v1/' + String(user.organizationID || user.organizationId || user.organization_id).toUpperCase() + '/' + user.id.toUpperCase(), bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))).slice(0, 16);
                    bytes[6] = (bytes[6] & 15) | 80;
                    bytes[8] = (bytes[8] & 63) | 128;
                    const hex = [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
                    next.id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
                }
                next.shared = false;
                next.content.viewScope = 'workspace-onboarding:v1';
                if (next.content.values[key(index)])
                    delete next.content.values[key(index)];
                else
                    next.content.values[key(index)] = new Date().toISOString();
                document = await saveDoc(next);
                draw();
            } })))));
    };
    draw();
    root.append(body);
    return root;
}
export async function productConsole(initial = 'overview') {
    const products = await listSpecialized('products'), root = stack(pageHeader({ eyebrow: 'Squared Group', title: 'Produits Squared', subtitle: 'Une fiche par produit, de sa feuille de route à ses résultats observés.' })), product = select('', choices(products, 'Choisir un produit')), tab = select(initial, [['overview', 'Vue d’ensemble'], ['metrics', 'Usage et économie'], ['roadmap', 'Feuille de route'], ['delivery', 'Versions et incidents'], ['subscriptions', 'Abonnements'], ['sources', 'Sources de données']].map(([value, label]) => ({ value, label }))), body = stack();
    const draw = async () => {
        body.replaceChildren();
        const selected = products.find(p => p.id === product.value);
        if (!selected)
            return;
        try {
            if (tab.value === 'overview') {
                const { specializedForm } = await import('../modules/data.js');
                body.append(card(selected.title, 'Fiche métier du produit.', stack(displayValue(selected.data), button('Ouvrir la fiche', { iconName: 'edit', onClick: () => specializedForm('products', selected, draw) }), button('Dossiers et revues', { iconName: 'document', onClick: async () => modal({ title: 'Dossiers du produit', wide: true, content: await renderGroup('products') }) }))));
            }
            else if (tab.value === 'metrics') {
                const from = input(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), { type: 'date' }), through = input(new Date().toISOString().slice(0, 10), { type: 'date' }), results = stack();
                const read = async () => {
                    if (!from.value || !through.value || from.value > through.value)
                        throw Error('Choisissez une période valide.');
                    const data = await call('/v1/workflows/group/products/' + selected.id + '/metrics?' + new URLSearchParams({ from: from.value, through: through.value }));
                    results.replaceChildren(displayValue(data));
                };
                body.append(notice('Ces mesures proviennent des événements reçus. La configuration d’un collecteur ne prouve pas sa première réception.'), actions(field('Du', from), field('Au', through), button('Lire les mesures', { iconName: 'chart', onClick: read })), results);
                await read();
            }
            else if (tab.value === 'sources') {
                const collectors = await call('/v1/workflows/group/collectors?productID=' + selected.id);
                body.append(notice('Les accès, liens de comptes et dernières réceptions restent ceux fournis par le serveur.'), displayValue((collectors.items || collectors.collectors || []).filter(v => v.productID === selected.id || v.product_id === selected.id)));
                const catalog = await contracts();
                for (const path of ['/v1/workflows/group/collectors/:id', '/v1/workflows/group/products/:id/account-links']) {
                    const op = catalog.operations.find(o => o.path === path && o.method === 'POST');
                    if (op && hasAny('manageOrganization', 'manageClients'))
                        body.append(button(path.includes('collectors') ? 'Configurer la collecte' : 'Relier un compte', { iconName: 'sync', onClick: () => openOperation(op, { context: { id: path.includes('collectors') ? uid() : selected.id, productID: selected.id, version: 0 }, onComplete: draw }) }));
                }
                if (hasAny('manageClients'))
                    body.append(displayValue(await call('/v1/workflows/group/products/' + selected.id + '/account-links')));
            }
            else {
                const kinds = ({ roadmap: ['product-features', 'roadmap-items', 'product-feedback'], delivery: ['product-versions', 'product-releases', 'product-incidents'], subscriptions: ['product-subscriptions'] })[tab.value] || [];
                for (const kind of kinds) {
                    const records = (await listSpecialized(kind)).filter(v => String(v.data?.productID || v.productID).toLowerCase() === selected.id.toLowerCase()), definition = state.domainCatalog?.kinds?.find(v => v.kind === kind || v.id === kind), { specializedForm } = await import('../modules/data.js');
                    body.append(card(definition?.title || kind, 'Fiches du produit sélectionné.', stack(definition?.canCreate && definition?.genericCreate !== false ? button('Ajouter', { iconName: 'add', onClick: () => specializedForm(kind, null, draw) }) : null, dataTable({ rows: records, name: 'product-' + kind, columns: [{ id: 'title', label: 'Intitulé' }, { id: 'status', label: 'Statut', render: r => statusDot(r.status) }, { id: 'version', label: 'Version' }], onOpen: r => definition?.writable && definition?.genericUpdate !== false ? specializedForm(kind, r, draw) : modal({ title: r.title, wide: true, content: displayValue(r) }) }))));
                }
            }
        }
        catch (error) {
            body.append(errorBox(error));
        }
    };
    for (const control of [product, tab])
        control.addEventListener('change', () => void draw());
    root.append(field('Produit', product), field('Vue', tab), body);
    return root;
}
export async function clientPortal() {
    const client = select('', choices(rows('clients'), 'Choisir un client')), root = stack(pageHeader({ eyebrow: 'Relations clients', title: String(state.user.role).toUpperCase() === 'CLIENT' ? 'Mon espace client' : 'Espace client', subtitle: 'Projets, pièces, livrables et décisions accessibles à votre compte.' })), body = stack(), isClient = String(state.user.role).toUpperCase() === 'CLIENT';
    const draw = () => {
        body.replaceChildren();
        const clients = isClient ? rows('clients') : rows('clients').filter(c => c.id === client.value);
        if (!clients.length) {
            body.append(emptyState('Choisissez un client', 'Cette vue interne ne prend jamais sa place dans une session.'));
            return;
        }
        for (const account of clients) {
            const projects = rows('projects').filter(p => p.clientID === account.id), ids = new Set(projects.map(p => p.id));
            body.append(card(account.name || account.title, 'Périmètre autorisé du compte connecté.', button('Fiche client', { iconName: 'company', onClick: () => setRoute('clients', '', account.id) })));
            for (const [key, title] of [['projects', 'Projets'], ['documents', 'Documents'], ['deliverables', 'Livrables'], ['validations', 'Décisions']]) {
                const values = key === 'projects' ? projects : rows(key).filter(r => ids.has(r.projectID));
                body.append(card(title, 'Éléments du dossier accessibles.', dataTable({ rows: values, name: 'client-portal-' + key, columns: [{ id: 'title', label: 'Intitulé', value: r => r.title || r.name }, { id: 'status', label: 'État', render: r => statusDot(r.status) }], onOpen: r => setRoute(key, '', r.id) })));
            }
        }
    };
    client.addEventListener('change', draw);
    root.append(notice(isClient ? 'Chaque action reste liée à votre compte et à la version présentée.' : 'Cette vue conserve vos propres droits ; elle ne simule pas les droits du client.'), !isClient ? field('Organisation cliente', client) : null, button('Ouvrir les échanges', { iconName: 'messages', onClick: () => setRoute('messages') }), body);
    draw();
    return root;
}
export async function wiki() {
    const collectionKey = '31e8fce8-0f84-4c0f-ace8-5e3d7af00001', reviewerKey = '31e8fce8-0f84-4c0f-ace8-5e3d7af00003', reviewKey = '31e8fce8-0f84-4c0f-ace8-5e3d7af00004';
    const root = stack(pageHeader({ eyebrow: 'Documentation interne', title: 'Wiki de l’équipe', subtitle: 'Procédures, décisions et notes de projet, avec versions et partage contrôlé.' })), collection = select('Toutes', []), project = select('', choices(rows('projects'), 'Tous les projets')), template = select('Page libre', ['Page libre', 'Procédure', 'Compte rendu', 'Décision', 'Référence'].map(value => ({ value, label: value }))), query = input('', { type: 'search', placeholder: 'Rechercher dans les titres et le contenu…' }), body = stack();
    let pages = [], mine = false, reviewOnly = false;
    const due = page => { const value = page.content.values[reviewKey]; return !!value && Number.isFinite(Date.parse(value)) && new Date(value) <= new Date(); };
    const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
    const draw = () => {
        const selected = pages.filter(page => (collection.value === 'Toutes' || (page.content.values[collectionKey] || 'Général') === collection.value) && (!project.value || page.projectID === project.value) && (!mine || page.ownerID === state.user.id) && (!reviewOnly || due(page)) && normalize([page.title, page.content.description, ...page.content.blocks.map(b => b.text)].join(' ')).includes(normalize(query.value)));
        const pageActions = selected => [{ label: 'Exporter ' + selected.length + ' page(s)', icon: 'download', group: 'Diffuser', run: () => downloadBlob(new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' }), 'wiki-workspace.json') }, hasAny('manageDocuments') ? { label: 'Archiver ' + selected.length + ' page(s)', icon: 'archive', danger: true, group: 'Organiser', run: async () => {
                    if (!await confirmDialog({ title: 'Archiver ces pages ?', message: selected.length + ' pages seront archivées et leurs liens révoqués.', danger: true }))
                        return;
                    for (const page of selected)
                        await call('/v1/studio/documents/' + page.id + '?version=' + page.version, { method: 'DELETE' });
                    await refresh();
                } } : null].filter(Boolean);
        body.replaceChildren(dataTable({ rows: selected, name: 'team-wiki', columns: [{ id: 'title', label: 'Page' }, { id: 'collection', label: 'Collection', value: r => r.content.values[collectionKey] || 'Général' }, { id: 'project', label: 'Projet', value: r => rows('projects').find(p => p.id === r.projectID)?.name || 'Transversal' }, { id: 'owner', label: 'Auteur', value: r => rows('team').find(p => p.id === r.ownerID)?.name || 'Non renseigné' }, { id: 'reviewer', label: 'Responsable de revue', value: r => rows('team').find(p => p.id.toLowerCase() === String(r.content.values[reviewerKey]).toLowerCase())?.name || 'Non attribué' }, { id: 'reviewDate', label: 'Prochaine revue', value: r => formatDate(r.content.values[reviewKey], { dateOnly: true }) }, { id: 'version', label: 'Version' }, { id: 'updatedAt', label: 'Modification', value: r => formatDate(r.updatedAt) }], onOpen: page => editStudio(page, refresh), actions: page => [{ label: 'Ouvrir', icon: 'document', group: 'Consulter', run: () => editStudio(page, refresh) }, ...pageActions([page])], selectionActions: pageActions }));
    };
    const refresh = async () => { pages = await listStudio('page'); const old = collection.value; collection.replaceChildren(...['Toutes', ...new Set(pages.map(p => p.content.values[collectionKey] || 'Général'))].map(value => h('option', { value, text: value }))); collection.value = [...collection.options].some(v => v.value === old) ? old : 'Toutes'; draw(); };
    const create = () => { const templates = { 'Procédure': ['Objectif', 'Quand utiliser cette procédure', 'Étapes', 'Contrôles et résultat attendu', 'Responsable et prochaine revue'], 'Compte rendu': ['Contexte et participants', 'Points abordés', 'Décisions', 'Actions, responsables et échéances'], 'Décision': ['Question à trancher', 'Options et éléments factuels', 'Décision retenue', 'Responsable, échéance et critères de revue'], 'Référence': ['À retenir', 'Documentation et sources', 'Exemples', 'Limites et mises à jour'] }; const doc = blankDoc('page', template.value === 'Page libre' ? 'Nouvelle page' : template.value, project.value || null); doc.content.values[collectionKey] = collection.value === 'Toutes' ? 'Général' : collection.value; doc.content.values['31e8fce8-0f84-4c0f-ace8-5e3d7af00002'] = template.value; doc.content.blocks = (templates[template.value] || []).flatMap(text => [{ id: uid(), kind: 'heading', text, checked: false, referenceID: null, url: '' }, { id: uid(), kind: 'text', text: '', checked: false, referenceID: null, url: '' }]); editStudio(doc, refresh); };
    for (const control of [collection, project])
        control.addEventListener('change', draw);
    query.addEventListener('input', draw);
    root.append(actions(field('Recherche', query), field('Collection', collection), field('Projet', project)), actions(toggle('Mes pages', mine, v => { mine = v; draw(); }), toggle('À revoir', reviewOnly, v => { reviewOnly = v; draw(); }), field('Modèle de nouvelle page', template), hasAny('manageDocuments') ? button('Nouvelle page', { iconName: 'add', kind: 'primary', onClick: create }) : null, button('', { iconName: 'sync', ariaLabel: 'Actualiser le wiki', onClick: refresh })), body);
    await refresh();
    return root;
}
export async function automationGraph() {
    const root = stack(pageHeader({ eyebrow: 'Automatisations', title: 'Parcours visuels', subtitle: 'Lecture des branches des règles enregistrées ; aucune exécution à l’ouverture.' }));
    for (const rule of await listSpecialized('automation-definitions')) {
        const data = rule.data || {}, flow = stack(card('Déclencheur', String(data.triggerKind || 'Non renseigné'), h('p', { text: 'Source : ' + String(data.collection || 'Non renseignée') })), h('span', { class: 'sq-flow-connector', 'aria-hidden': 'true', text: '↓' }), card('Toutes les conditions', data.conditions?.length ? 'La branche Non termine le parcours sans action.' : 'Aucune condition enregistrée.', displayValue(data.conditions || [])), h('span', { class: 'sq-flow-connector', 'aria-hidden': 'true', text: '↓' }));
        if (data.requiresApproval)
            flow.append(card('Autorisation humaine', 'Les actions attendent leur confirmation explicite.', h('p', { text: 'Avant les actions' })));
        for (const action of data.actions || [])
            flow.append(card('Action prévue', action.kind || action.type || 'Action', displayValue(action)));
        root.append(card(rule.title, 'Version ' + rule.version, stack(flow, button('Modifier la règle', { iconName: 'edit', onClick: async () => { const { specializedForm } = await import('../modules/data.js'); specializedForm('automation-definitions', rule, async () => { }); } }), button('Ouvrir le bac à sable', { iconName: 'search', onClick: () => setRoute('activity', 'op-sandbox') }))));
    }
    return root;
}
