import { h, button, field, input, select, textarea, card, emptyState, toast, errorMessage, formatDate } from '../ui.js';
import { state, setRoute, rows, choices, stack, actions, notice, toggle, bind, uid, clone, block, blankDoc, listStudio, saveDoc, modal, call, hasAny, scope, confirmDialog, errorBox } from './operation-kit.js';
import { dataTable, downloadBlob } from './components.js';
import { uploadFile } from '../api.js';
import { openMedia } from './media.js';
const categoryKey = '5af9a3cf-124c-4b7d-94ce-cf4114500002';
const kindNames = { page: 'Pages', form: 'Formulaires', portal: 'Espaces clients', scenario: 'Scénarios', annotation: 'Annotations' };
const permission = kind => kind === 'scenario' ? 'manageFinance' : ['form', 'portal'].includes(kind) ? 'manageProjects' : 'manageDocuments';
export async function studioLibrary({ kind = 'page', category = '', title, template = [], projectID = null } = {}) {
    const root = stack(), body = stack(), project = select(projectID || '', choices(rows('projects'), 'Tous les projets'));
    let documents = [];
    const owner = scope();
    const refresh = async () => {
        try {
            documents = (await listStudio(kind)).filter(d => (!category || d.content?.values?.[categoryKey] === category) && (!project.value || d.projectID === project.value));
            if (owner !== scope())
                return;
            body.replaceChildren(dataTable({ rows: documents, name: 'studio-' + kind + '-' + category, columns: [{ id: 'title', label: 'Titre' }, { id: 'version', label: 'Version' }, { id: 'updatedAt', label: 'Dernière modification', render: r => formatDate(r.updatedAt) }, { id: 'shared', label: 'Visibilité', render: r => r.shared ? 'Partagée dans son périmètre' : 'Privée' }], onOpen: doc => editStudio(doc, refresh), actions: doc => [{ label: 'Ouvrir', icon: 'edit', run: () => editStudio(doc, refresh) }], selectionActions: selected => [{ label: 'Exporter ' + selected.length + ' fiche(s)', icon: 'download', run: () => downloadBlob(new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' }), 'pages-workspace.json') }, hasAny(permission(kind)) ? { label: 'Archiver ' + selected.length + ' fiche(s)', icon: 'archive', danger: true, run: async () => {
                            if (!await confirmDialog({ title: 'Archiver ces fiches ?', message: selected.length + ' fiche(s) seront retirées des vues actives.', danger: true }))
                                return;
                            for (const doc of selected)
                                await call('/v1/studio/documents/' + doc.id + '?version=' + doc.version, { method: 'DELETE' });
                            await refresh();
                        } } : null].filter(Boolean) }));
        }
        catch (e) {
            body.replaceChildren(errorBox(e));
        }
    };
    root.append(actions(field('Projet', project), button('Actualiser', { iconName: 'sync', onClick: refresh }), hasAny(permission(kind)) ? button('Créer ' + (kind === 'form' ? 'un formulaire' : kind === 'portal' ? 'un espace client' : kind === 'scenario' ? 'un scénario' : 'une page'), { iconName: 'add', kind: 'primary', onClick: () => {
            const doc = blankDoc(kind, title || 'Nouvelle fiche', project.value || null);
            if (category)
                doc.content.values[categoryKey] = category;
            doc.content.blocks = template.flatMap(text => [block('heading', text), block()]);
            editStudio(doc, refresh);
        } }) : null), body);
    project.addEventListener('change', refresh);
    await refresh();
    return root;
}
export function editStudio(original, onSaved = async () => { }) {
    let doc = clone(original), dirty = false, saving = false;
    const owner = scope(), body = stack(), feedback = h('div'), title = bind(input(doc.title, { required: true, maxLength: 180 }), v => { doc.title = v; dirty = true; }), project = select(doc.projectID || '', choices(rows('projects'), 'Sans projet'));
    project.disabled = doc.version > 0;
    project.addEventListener('change', () => { doc.projectID = project.value || null; dirty = true; });
    const content = stack(), tab = select('content', [{ value: 'content', label: 'Contenu' }, { value: 'history', label: 'Historique et restauration' }, { value: 'sharing', label: 'Partage et collecte' }]);
    const draw = () => {
        content.replaceChildren();
        if (tab.value === 'history') {
            if (dirty) {
                content.append(notice('Enregistrez ou abandonnez les modifications en cours avant de restaurer une ancienne version.', 'warning'));
                return;
            }
            void historyPanel(doc, updated => { doc = updated; dirty = false; title.value = doc.title; void onSaved(); }).then(node => content.append(node)).catch(e => content.append(errorBox(e)));
            return;
        }
        if (tab.value === 'sharing') {
            content.append(notice(doc.version ? 'Une modification révoque les anciens liens externes. Seuls les formulaires et espaces clients proposent un lien externe.' : 'Enregistrez la fiche avant de créer un lien.'));
            if (['portal', 'form'].includes(doc.kind) && doc.version && hasAny(permission(doc.kind))) {
                const days = input('7', { type: 'number', min: 1, max: 30 }), result = stack();
                content.append(field('Validité du lien (jours)', days), button('Créer un lien de cette version', { iconName: 'share', onClick: async () => {
                        if (!await confirmDialog({ title: 'Créer ce lien de partage ?', message: 'Seuls les éléments et options de cette version seront exposés pendant ' + days.value + ' jours.' }))
                            return;
                        const value = await call('/v1/studio/documents/' + doc.id + '/share', { method: 'POST', body: { version: doc.version, days: Number(days.value) } });
                        result.replaceChildren(h('a', { href: value.url, target: '_blank', rel: 'noopener noreferrer', text: 'Ouvrir le lien partagé' }), h('p', { text: 'Expire le ' + formatDate(value.expiresAt) }));
                    } }), button('Révoquer le lien externe', { iconName: 'lock', onClick: async () => {
                        if (await confirmDialog({ title: 'Révoquer ce lien ?', message: 'Les visiteurs ne pourront plus utiliser le lien actuel.' })) {
                            await call('/v1/studio/documents/' + doc.id + '/share', { method: 'DELETE' });
                            result.replaceChildren(notice('Lien révoqué.'));
                        }
                    } }), result);
            }
            if (doc.kind === 'form' && doc.version)
                content.append(button('Lire les réponses autorisées', { iconName: 'messages', onClick: async () => { const data = await call('/v1/studio/documents/' + doc.id + '/responses'); content.append(dataTable({ rows: data.responses || [], columns: [{ id: 'author', label: 'Auteur' }, { id: 'createdAt', label: 'Date' }, { id: 'kind', label: 'Type' }], onOpen: row => modal({ title: 'Réponse', content: stack(h('p', { text: row.author || '' }), ...Object.entries(row.answers || {}).map(([id, value]) => h('p', { text: (doc.content.questions.find(q => q.id === id)?.label || 'Question') + ' : ' + String(value) }))) }) })); } }));
            return;
        }
        const description = bind(textarea(doc.content.description || '', { rows: 3, placeholder: 'Contexte et périmètre…' }), v => { doc.content.description = v; dirty = true; });
        content.append(field('Description', description));
        if (doc.kind === 'page') {
            const collectionKey = '31e8fce8-0f84-4c0f-ace8-5e3d7af00001', reviewerKey = '31e8fce8-0f84-4c0f-ace8-5e3d7af00003', reviewKey = '31e8fce8-0f84-4c0f-ace8-5e3d7af00004';
            content.append(field('Collection', bind(input(doc.content.values[collectionKey] || 'Général'), v => { doc.content.values[collectionKey] = v.trim(); dirty = true; })), field('Responsable de revue', bind(select(doc.content.values[reviewerKey] || '', choices(rows('team'), 'Non attribué')), v => {
                if (v)
                    doc.content.values[reviewerKey] = v.toLowerCase();
                else
                    delete doc.content.values[reviewerKey];
                dirty = true;
            }, 'change')), field('Prochaine revue', bind(input((doc.content.values[reviewKey] || '').slice(0, 10), { type: 'date' }), v => {
                if (v)
                    doc.content.values[reviewKey] = v + 'T00:00:00.000Z';
                else
                    delete doc.content.values[reviewKey];
                dirty = true;
            }, 'change')));
        }
        if (doc.kind === 'form') {
            formQuestions(content, doc, () => { dirty = true; draw(); }, () => { dirty = true; });
            return;
        }
        if (doc.kind === 'portal') {
            portalEditor(content, doc, () => { dirty = true; draw(); }, () => { dirty = true; });
            return;
        }
        if (doc.kind === 'scenario') {
            scenarioEditor(content, doc, () => { dirty = true; draw(); }, () => { dirty = true; });
            return;
        }
        for (const item of doc.content.blocks || []) {
            const area = stack();
            const type = bind(select(item.kind, [{ value: 'text', label: 'Texte' }, { value: 'heading', label: 'Titre' }, { value: 'checklist', label: 'Checklist' }, { value: 'image', label: 'Image' }, { value: 'file', label: 'Fichier' }]), v => { item.kind = v; dirty = true; draw(); }, 'change');
            area.append(field('Type de bloc', type), field(item.kind === 'heading' ? 'Titre' : 'Texte ou légende', bind(textarea(item.text, { rows: item.kind === 'heading' ? 2 : 4 }), v => { item.text = v; dirty = true; })));
            if (item.kind === 'checklist')
                area.append(toggle('Terminé', item.checked, v => { item.checked = v; dirty = true; }));
            if (['image', 'file'].includes(item.kind)) {
                const chosen = select(item.referenceID || '', choices(rows('documents').filter(d => d.storageKey).map(d => ({ ...d, id: d.storageKey })), 'Choisir dans Documents'));
                chosen.addEventListener('change', () => { item.referenceID = chosen.value || null; item.url = rows('documents').find(d => d.storageKey === chosen.value)?.originalFileName || ''; dirty = true; });
                const importer = input('', { type: 'file' });
                if (item.kind === 'image')
                    importer.accept = 'image/*';
                importer.addEventListener('change', async () => {
                    const file = importer.files?.[0];
                    if (!file)
                        return;
                    try {
                        const stored = await uploadFile(file, 'workflowAttachment', state.user.id);
                        item.referenceID = stored.id;
                        item.url = stored.fileName;
                        dirty = true;
                        toast('Fichier importé ; enregistrez la page pour le lier.');
                        draw();
                    }
                    catch (e) {
                        feedback.replaceChildren(errorBox(e));
                    }
                });
                area.append(field('Document existant', chosen), field('Importer un fichier', importer), item.referenceID ? button('Voir le média', { iconName: 'search', onClick: () => openMedia({ fileID: item.referenceID, name: item.url || item.text || 'Média' }) }) : null);
            }
            area.append(actions(button('Monter', { iconName: 'ChevronUp', onClick: () => move(doc.content.blocks, item.id, -1, () => { dirty = true; draw(); }) }), button('Descendre', { iconName: 'ChevronDown', onClick: () => move(doc.content.blocks, item.id, 1, () => { dirty = true; draw(); }) }), button('Retirer ce bloc', { iconName: 'trash', onClick: async () => {
                    if (await confirmDialog({ title: 'Retirer ce bloc ?', message: 'Le changement sera appliqué à l’enregistrement de la fiche.' })) {
                        doc.content.blocks = doc.content.blocks.filter(v => v.id !== item.id);
                        dirty = true;
                        draw();
                    }
                } })));
            content.append(card('Bloc ' + ((doc.content.blocks.indexOf(item)) + 1), '', area));
        }
        content.append(button('Ajouter un bloc', { iconName: 'add', onClick: () => {
                if (doc.content.blocks.length >= 300)
                    return;
                doc.content.blocks.push(block());
                dirty = true;
                draw();
            } }));
    };
    body.append(field('Titre', title), field('Projet', project), toggle('Partager dans le périmètre de la fiche', doc.shared, v => { doc.shared = v; dirty = true; }), field('Rubrique', tab), content, feedback);
    tab.addEventListener('change', draw);
    const dialog = modal({ title: kindNames[doc.kind] || 'Fiche Workspace', wide: true, className: 'sq-studio-editor', content: body, beforeClose: () => {
            if (saving)
                return false;
            if (dirty) {
                feedback.replaceChildren(notice('Votre saisie n’est pas enregistrée. Enregistrez-la ou choisissez Abandonner la saisie.', 'warning'));
                return false;
            }
            return true;
        }, actions: [{ label: 'Abandonner la saisie', icon: 'close', onClick: async (close) => {
                    if (!dirty || await confirmDialog({ title: 'Abandonner votre saisie ?', message: 'Les changements non enregistrés seront retirés de ce formulaire.', danger: true })) {
                        dirty = false;
                        close();
                    }
                } }, { label: 'Enregistrer', kind: 'primary', icon: 'check', disabled: !hasAny(permission(doc.kind)), onClick: async () => {
                    if (!title.reportValidity() || saving)
                        return;
                    saving = true;
                    feedback.replaceChildren();
                    try {
                        const saved = await saveDoc(doc);
                        if (scope() !== owner)
                            return;
                        doc = saved;
                        dirty = false;
                        feedback.replaceChildren(notice('Version ' + doc.version + ' enregistrée.', 'success'));
                        await onSaved(doc);
                    }
                    catch (e) {
                        feedback.replaceChildren(errorBox(e));
                    }
                    finally {
                        saving = false;
                    }
                } }] });
    draw();
    return dialog;
}
function move(items, id, delta, render) {
    const index = items.findIndex(v => v.id === id), next = index + delta;
    if (index < 0 || next < 0 || next >= items.length)
        return;
    [items[index], items[next]] = [items[next], items[index]];
    render();
}
function formQuestions(root, doc, changed, mark) {
    const target = select(doc.content.target || 'task', [{ value: 'task', label: 'Tâche' }, { value: 'project', label: 'Projet' }, { value: 'client', label: 'Client' }, { value: 'ticket', label: 'Ticket' }]);
    target.addEventListener('change', () => { doc.content.target = target.value; changed(); });
    root.append(field('Créer à partir des réponses', target));
    for (const [index, q] of (doc.content.questions || []).entries()) {
        const prior = doc.content.questions.slice(0, index), label = bind(input(q.label, { required: true }), v => { q.label = v; mark(); }), type = bind(select(q.type, ['text', 'longText', 'email', 'number', 'choice', 'date', 'file'].map(value => ({ value, label: ({ text: 'Texte court', longText: 'Texte long', email: 'E-mail', number: 'Nombre', choice: 'Choix', date: 'Date', file: 'Pièce jointe' })[value] }))), v => { q.type = v; changed(); }, 'change'), condition = bind(select(q.conditionQuestionID || '', choices(prior.map(v => ({ id: v.id, title: v.label })), 'Toujours afficher')), v => { q.conditionQuestionID = v || null; changed(); }, 'change');
        root.append(card('Question ' + (index + 1), '', stack(field('Intitulé', label), field('Type de réponse', type), toggle('Obligatoire', q.required, v => { q.required = v; mark(); }), q.type === 'choice' ? field('Choix (un par ligne)', bind(textarea((q.options || []).join('\n'), { rows: 3 }), v => q.options = v.split('\n').map(s => s.trim()).filter(Boolean))) : null, field('Afficher si cette question…', condition), q.conditionQuestionID ? field('Réponse attendue', bind(input(q.conditionValue || ''), v => { q.conditionValue = v; mark(); })) : null, actions(button('Monter', { iconName: 'ChevronUp', onClick: () => {
                const next = index - 1;
                if (next >= 0 && q.conditionQuestionID && doc.content.questions[next].id === q.conditionQuestionID)
                    throw Error('Retirez la condition avant de déplacer la question avant sa dépendance.');
                move(doc.content.questions, q.id, -1, changed);
            } }), button('Retirer', { iconName: 'trash', onClick: () => {
                if (doc.content.questions.some(v => v.conditionQuestionID === q.id))
                    throw Error('Cette question commande encore une question conditionnelle.');
                doc.content.questions = doc.content.questions.filter(v => v.id !== q.id);
                changed();
            } })))));
    }
    root.append(button('Ajouter une question', { iconName: 'add', onClick: () => {
            if ((doc.content.questions || []).length >= 100)
                return;
            doc.content.questions ||= [];
            doc.content.questions.push({ id: uid(), label: 'Nouvelle question', type: 'text', required: false, options: [], conditionQuestionID: null, conditionValue: '' });
            changed();
        } }));
}
function portalEditor(root, doc, changed, mark) {
    root.append(toggle('Autoriser les commentaires', doc.content.allowComments !== false, v => { doc.content.allowComments = v; mark(); }), toggle('Proposer la validation des livrables', !!doc.content.allowValidation, v => { doc.content.allowValidation = v; mark(); }));
    for (const [kind, key] of [['deliverable', 'deliverables'], ['document', 'documents'], ['quote', 'quotes'], ['invoice', 'invoices']])
        for (const row of rows(key).filter(v => v.projectID === doc.projectID)) {
            root.append(toggle(row.title, (doc.content.exposed || []).some(v => v.kind === kind && v.id === row.id), v => {
                doc.content.exposed ||= [];
                doc.content.exposed = doc.content.exposed.filter(item => !(item.kind === kind && item.id === row.id));
                if (v)
                    doc.content.exposed.push({ kind, id: row.id });
                mark();
            }));
        }
    root.append(notice('Seules les pièces explicitement cochées sont exposées par le lien client. Le serveur revalide leurs accès.'));
}
function scenarioEditor(root, doc, changed, mark) {
    const c = doc.content;
    root.append(field('Devise', bind(input(c.currency || 'EUR'), v => { c.currency = v.toUpperCase(); mark(); })), field('Revenu envisagé', bind(input(c.revenue ?? 0, { type: 'number', min: 0, step: '.01' }), v => { c.revenue = Number(v); mark(); })), field('Aléas (%)', bind(input(c.contingency ?? 0, { type: 'number', min: 0, max: 100, step: '.1' }), v => { c.contingency = Number(v); mark(); })));
    for (const cost of c.costs || [])
        root.append(card('Poste de coût', 'Hypothèse', stack(field('Intitulé', bind(input(cost.title), v => { cost.title = v; mark(); })), field('Nature', bind(select(cost.category || 'expense', [{ value: 'labor', label: 'Travail' }, { value: 'expense', label: 'Dépense' }]), v => { cost.category = v; mark(); }, 'change')), field('Quantité', bind(input(cost.quantity, { type: 'number', min: 0 }), v => { cost.quantity = Number(v); mark(); })), field('Coût unitaire', bind(input(cost.unitCost, { type: 'number', min: 0, step: '.01' }), v => { cost.unitCost = Number(v); mark(); })), button('Retirer ce coût', { iconName: 'trash', onClick: () => { c.costs = c.costs.filter(v => v.id !== cost.id); changed(); } }))));
    root.append(button('Ajouter un poste', { iconName: 'add', onClick: () => { c.costs ||= []; c.costs.push({ id: uid(), title: 'Nouveau poste', category: 'expense', quantity: 1, unitCost: 0, memberID: null }); changed(); } }), button('Calculer ces hypothèses', { iconName: 'chart', onClick: () => { const base = (c.costs || []).reduce((n, v) => n + Math.round(v.quantity * v.unitCost * 100) / 100, 0), total = Math.round(base * (1 + (c.contingency || 0) / 100) * 100) / 100; root.append(notice('Coût envisagé : ' + total.toLocaleString('fr-FR') + ' ' + c.currency + ' · marge envisagée : ' + (Number(c.revenue || 0) - total).toLocaleString('fr-FR') + ' ' + c.currency + '. Ces hypothèses ne constituent pas des écritures comptables.')); } }));
}
export async function historyPanel(doc, onSaved = async () => { }) {
    const root = stack(), data = await call('/v1/studio/documents/' + doc.id + '/versions');
    for (const row of data.versions || [])
        root.append(button('Version ' + row.version + ' · ' + row.title + ' · ' + formatDate(row.saved_at), { iconName: 'clock', onClick: async () => {
                const old = (await call('/v1/studio/documents/' + doc.id + '/versions/' + row.version)).document, selected = new Set();
                let title = false, description = false;
                const body = stack(notice('Les blocs non sélectionnés seront conservés. Le serveur vérifiera la version actuelle.'), toggle('Reprendre le titre : ' + old.title, false, v => title = v), toggle('Reprendre la description', false, v => description = v));
                for (const item of old.content.blocks)
                    body.append(card(item.kind, '', stack(toggle('Reprendre ce bloc', false, v => v ? selected.add(item.id) : selected.delete(item.id)), h('p', { text: item.text || item.url || '' }))));
                modal({ title: 'Restaurer une sélection · version ' + row.version, wide: true, content: body, actions: [{ label: 'Restaurer la sélection', kind: 'primary', icon: 'sync', onClick: async (close) => {
                                if (!title && !description && !selected.size)
                                    throw Error('Choisissez au moins un champ ou un bloc.');
                                if (!await confirmDialog({ title: 'Restaurer cette sélection ?', message: selected.size + ' bloc(s) et les champs choisis seront repris dans une nouvelle version.' }))
                                    return;
                                const next = clone(doc);
                                if (title)
                                    next.title = old.title;
                                if (description)
                                    next.content.description = old.content.description;
                                for (const b of old.content.blocks.filter(v => selected.has(v.id))) {
                                    const index = next.content.blocks.findIndex(v => v.id === b.id);
                                    if (index < 0)
                                        next.content.blocks.push(b);
                                    else
                                        next.content.blocks[index] = b;
                                }
                                const saved = await saveDoc(next);
                                await onSaved(saved);
                                close();
                                toast('Sélection restaurée dans la version ' + saved.version);
                            } }] });
            } }));
    return root;
}
