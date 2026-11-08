import { state, setRoute, h, button, field, input, select, card, emptyState, call, rows, stack, actions, notice, hasAny, errorBox } from './operation-kit.js';
import { dataTable, downloadBlob, displayValue, tone, labelFor } from './components.js';
import { pageHeader, formatDate, statusText } from '../ui.js';
import { NATIVE_PAGES } from './catalog.js';
import { renderBusinessPage } from './workflows.js';
import { listSpecialized, loadSettings } from '../api.js';
const sourceNames = { projects: 'Projets', missions: 'Missions', tasks: 'Tâches', validations: 'Validations', deliverables: 'Livrables', clients: 'Clients', invoices: 'Factures', payments: 'Règlements', expenses: 'Dépenses', opportunities: 'Opportunités', quotes: 'Devis', tickets: 'Support', campaigns: 'Campagnes', events: 'Événements', documents: 'Fichiers', team: 'Équipe' };
const archived = () => new Set(state.workspace?.intelligence?.archivedEntityIDs || []);
const active = key => rows(key).filter(r => !archived().has(r.id));
const number = v => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const done = v => /^(completed|cancelled|done|closed|rejected|delivered)$/.test(v || '');
const distribution = items => Object.entries(items.reduce((map, r) => { const key = r.status || r.state || 'Non renseigné'; map[key] = (map[key] || 0) + 1; return map; }, {})).map(([label, value]) => ({ label: statusText(label), value, tint: tone(label) }));
export function chart(points, { title = 'Valeurs observées', kind = 'bars', unit = '', label = 'Relevés', color = '#22B266' } = {}) {
    if (!points.length)
        return emptyState('Aucun relevé dans cette sélection', 'Aucune valeur n’est remplacée par zéro et aucune série n’est inventée.', 'chart');
    const root = h('figure', { class: 'sq-stat-chart', 'aria-label': title }), max = Math.max(1, ...points.map(p => Math.abs(p.value)));
    if (kind === 'bars') {
        root.append(h('div', { class: 'sq-chart-bars' }, ...points.map(p => h('div', { class: 'sq-chart-bar-row' }, h('span', { text: p.label }), h('div', { class: 'sq-chart-track' }, h('i', { class: 'sq-tone-' + (p.tint || 'green'), style: { width: Math.max(1, Math.abs(p.value) / max * 100) + '%', '--chart-color': color } })), h('strong', { text: p.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + (unit ? ' ' + unit : '') })))));
    }
    else {
        const width = 900, height = 220, pad = 20, min = Math.min(0, ...points.map(p => p.value)), high = Math.max(1, ...points.map(p => p.value)), range = high - min, svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', title + ' · ' + points.length + ' relevés');
        const coords = points.map((p, i) => [pad + (points.length === 1 ? .5 : i / (points.length - 1)) * (width - pad * 2), height - pad - (p.value - min) / range * (height - pad * 2)]);
        const line = document.createElementNS(svg.namespaceURI, 'polyline');
        line.setAttribute('points', coords.map(p => p.join(',')).join(' '));
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('fill', 'none');
        svg.append(line);
        for (const [i, xy] of coords.entries()) {
            const dot = document.createElementNS(svg.namespaceURI, 'circle');
            dot.setAttribute('cx', xy[0]);
            dot.setAttribute('cy', xy[1]);
            dot.setAttribute('r', '4');
            dot.setAttribute('fill', color);
            const titleNode = document.createElementNS(svg.namespaceURI, 'title');
            titleNode.textContent = points[i].label + ' : ' + points[i].value + ' ' + unit;
            dot.append(titleNode);
            svg.append(dot);
        }
        root.append(svg);
    }
    root.append(h('figcaption', { text: label + ' · ' + points.length + ' point(s) · ' + unit }));
    return root;
}
function counter(title, value, detail) { return h('div', { class: 'sq-stat-counter' }, h('span', { text: title }), h('strong', { text: typeof value === 'number' ? value.toLocaleString('fr-FR') : String(value ?? '—') }), h('small', { text: detail })); }
function localInventory(keys) { return h('div', { class: 'sq-stat-counters' }, ...keys.map(key => counter(sourceNames[key], active(key).length, 'Fiches autorisées chargées'))); }
function sourcePermissions(source) { return ({ invoices: ['viewFinance', 'manageFinance'], payments: ['viewFinance', 'manageFinance'], expenses: ['viewFinance', 'manageFinance'], opportunities: ['manageSales'], quotes: ['manageSales', 'viewFinance', 'manageFinance'], clients: ['manageClients'], tickets: ['manageSupport'], campaigns: ['manageMarketing'] })[source] || []; }
function dateKey(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; }
function localDay(date) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
function history(timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }), calendarDay = value => { const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(p => [p.type, p.value])); return parts.year + '-' + parts.month + '-' + parts.day; }, periodKey = date => date.toISOString().slice(0, 10);
    const all = (state.workspace?.enterprise?.metricSamples || []).filter(v => Number.isFinite(v.value) && dateKey(v.recordedAt)), codes = [...new Set(all.map(v => v.metric))].sort(), metric = select(codes[0] || '', codes.map(value => ({ value, label: value }))), context = select('', []), from = input(calendarDay(new Date(Date.now() - 30 * 86400000)), { type: 'date' }), through = input(calendarDay(new Date()), { type: 'date' }), bucket = select('day', [{ value: 'day', label: 'Jour' }, { value: 'week', label: 'Semaine' }, { value: 'month', label: 'Mois' }]), reading = select('last', [{ value: 'last', label: 'Dernier relevé' }, { value: 'average', label: 'Moyenne des relevés' }, { value: 'minimum', label: 'Minimum' }, { value: 'maximum', label: 'Maximum' }]), kind = select('line', [{ value: 'line', label: 'Courbe' }, { value: 'bars', label: 'Barres' }]), body = stack(), root = stack();
    let comparison = true, exportValue;
    const scopeKey = v => v.entityKind && v.entityID ? v.entityKind + ':' + v.entityID : 'workspace';
    const normalize = () => {
        const current = context.value;
        context.replaceChildren(...[...new Set(all.filter(v => v.metric === metric.value).map(scopeKey))].map(value => h('option', { value, text: value === 'workspace' ? 'Tout l’espace' : value })));
        if ([...context.options].some(v => v.value === current))
            context.value = current;
    };
    const points = (start, end) => {
        const group = new Map();
        for (const row of all.filter(v => v.metric === metric.value && scopeKey(v) === context.value && calendarDay(v.recordedAt) >= periodKey(start) && calendarDay(v.recordedAt) < periodKey(end)).sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))) {
            const date = new Date(calendarDay(row.recordedAt) + "T00:00:00Z");
            if (bucket.value === 'month')
                date.setUTCDate(1);
            else if (bucket.value === 'week')
                date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
            const key = periodKey(date);
            if (!group.has(key))
                group.set(key, []);
            group.get(key).push(row.value);
        }
        return [...group].sort(([a], [b]) => a.localeCompare(b)).map(([label, values]) => ({ id: label, label, value: reading.value === 'last' ? values.at(-1) : reading.value === 'average' ? values.reduce((n, v) => n + v, 0) / values.length : reading.value === 'minimum' ? Math.min(...values) : Math.max(...values), sampleCount: values.length }));
    };
    const draw = () => {
        const start = new Date(from.value + 'T00:00:00Z'), end = new Date(through.value + 'T00:00:00Z');
        end.setUTCDate(end.getUTCDate() + 1);
        if (!Number.isFinite(+start) || !Number.isFinite(+end) || start >= end) {
            body.replaceChildren(notice('Choisissez une période valide.', 'warning'));
            exportValue = null;
            return;
        }
        const observed = points(start, end), oldStart = new Date(+start - (end - start)), previous = comparison ? points(oldStart, start) : [];
        exportValue = { generatedAt: new Date().toISOString(), timezone, metric: metric.value, scope: context.value, from: from.value, through: through.value, bucket: bucket.value, reading: reading.value, observed, previous, limitations: ['Relevés autorisés présents dans le Workspace chargé.', 'Aucun comblement ni interpolation des périodes sans relevé.', 'Calendrier dans le fuseau ' + timezone + '.'] };
        body.replaceChildren(chart(observed, { title: metric.value, kind: kind.value, label: 'Période sélectionnée' }), dataTable({ rows: observed, name: 'statistics-observed', columns: [{ id: 'label', label: 'Période' }, { id: 'value', label: 'Valeur' }, { id: 'sampleCount', label: 'Relevés' }] }));
        if (comparison)
            body.append(h('h3', { text: 'Période précédente de même durée' }), chart(previous, { title: 'Période précédente', kind: kind.value, color: '#89909C', label: periodKey(oldStart) + ' au ' + periodKey(new Date(+start - 1)) }));
    };
    const compare = input('', { type: 'checkbox' });
    compare.checked = true;
    compare.addEventListener('change', () => { comparison = compare.checked; draw(); });
    metric.addEventListener('change', () => { normalize(); draw(); });
    for (const control of [context, from, through, bucket, reading, kind])
        control.addEventListener('change', draw);
    normalize();
    root.append(notice('Les historiques utilisent les relevés enregistrés, regroupés dans le fuseau ' + timezone + '. Les périodes sans relevé restent absentes.'), h('div', { class: 'sq-stat-filters' }, field('Indicateur', metric), field('Provenance', context), field('Du', from), field('Au', through), field('Regrouper par', bucket), field('Lecture', reading), field('Graphique', kind), field('Comparer à la période précédente', compare)), button('Exporter cette lecture', { iconName: 'download', onClick: () => {
            if (!exportValue)
                throw Error('Choisissez une période valide.');
            downloadBlob(new Blob([JSON.stringify(exportValue, null, 2)], { type: 'application/json' }), 'statistiques-historique.json');
        } }), body);
    if (!codes.length)
        root.append(emptyState('Aucun historique disponible', 'Les graphiques apparaîtront lorsque des relevés seront enregistrés.', 'chart'));
    draw();
    return root;
}
async function serverInventory(sources, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    const root = stack(), grid = h('div', { class: 'sq-stat-grid' });
    root.append(notice('Agrégats calculés côté serveur sur le périmètre autorisé. Les compteurs locaux restent limités aux fiches chargées.'), grid);
    for (const source of sources) {
        const rights = sourcePermissions(source);
        if (rights.length && !hasAny(rights))
            continue;
        try {
            const data = await call('/v1/workflows/custom-reports/preview', { method: 'POST', body: { title: 'Statistiques · ' + source, configuration: { source, columns: ['title'], groupBy: 'status', metric: 'count', timezone }, includeExports: false } }), groups = data.groups || [], count = groups.reduce((n, g) => n + Number(g.count || 0), 0);
            grid.append(card(sourceNames[source] || source, 'Inventaire serveur autorisé · ' + formatDate(new Date()), stack(counter('Total', data.count ?? data.totalCount ?? data.total ?? count, 'Périmètre serveur'), chart(groups.map(g => ({ label: statusText(g.label), value: Number(g.count || 0), tint: tone(g.label) }))), button('Détails de la source', { iconName: 'document', onClick: () => { void import('../ui.js').then(({ modal }) => modal({ title: sourceNames[source], content: displayValue(data), wide: true })); } }))));
        }
        catch (error) {
            grid.append(card(sourceNames[source] || source, 'Agrégat non disponible', errorBox(error)));
        }
    }
    return root;
}
export async function renderStatistics(subpage = '') {
    let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
        timezone = (await loadSettings()).timezone || timezone;
    }
    catch { }
    const meta = NATIVE_PAGES.reports?.find(p => p.id === subpage) || NATIVE_PAGES.reports?.[0], page = meta?.nativeID || 'Direction', root = stack(pageHeader({ eyebrow: 'Pilotage de l’espace', title: 'Statistiques', subtitle: meta?.title || 'Vue d’ensemble', actions: [button('', { iconName: 'sync', ariaLabel: 'Actualiser les statistiques', onClick: () => window.dispatchEvent(new Event('sq:refresh')) })] }));
    root.append(notice('Les données affichées respectent les droits du compte connecté. Dernière confirmation du Workspace : ' + (state.lastSyncAt ? formatDate(state.lastSyncAt) : 'non renseignée') + '.'));
    if (page === 'Évolution') {
        root.append(history(timezone));
        return root;
    }
    if (page === 'Personnalisés') {
        root.append(await renderBusinessPage('reports', subpage));
        return root;
    }
    const lists = { Direction: ['projects', 'missions', 'tasks', 'validations', 'deliverables', 'events', 'documents'], Projets: ['projects', 'missions', 'tasks', 'deliverables', 'validations'], Planification: ['tasks', 'events'], Finance: ['invoices', 'payments', 'expenses'], Rentabilité: ['projects', 'invoices', 'expenses'], Commercial: ['opportunities', 'quotes'], Clients: ['clients', 'projects'], Communication: ['conversations'], Fichiers: ['documents'], Sécurité: [], 'Sources et qualité': [] };
    const keys = lists[page] || [];
    if (keys.length)
        root.append(localInventory(keys));
    const serverSources = { Direction: ['projects', 'tasks', 'clients', 'invoices', 'opportunities', 'tickets', 'campaigns'], Projets: ['projects', 'tasks'], Finance: ['invoices', 'payments', 'expenses'], Rentabilité: ['invoices', 'payments', 'expenses'], Commercial: ['opportunities', 'quotes'], Clients: ['clients', 'projects'], Support: ['tickets'], Marketing: ['campaigns'], 'Sources et qualité': ['projects', 'tasks', 'clients', 'invoices', 'opportunities', 'tickets', 'campaigns'] };
    if (serverSources[page])
        root.append(await serverInventory(serverSources[page], timezone));
    if (['Direction', 'Projets'].includes(page)) {
        const grid = h('div', { class: 'sq-stat-grid' });
        for (const key of ['projects', 'missions', 'tasks'])
            grid.append(card('États des ' + sourceNames[key].toLocaleLowerCase(), 'Fiches non archivées chargées.', chart(distribution(active(key)))));
        grid.append(card('Avancement des projets', 'Pourcentage indiqué dans les fiches chargées.', chart(active('projects').filter(p => number(p.progress) !== null).sort((a, b) => b.progress - a.progress).slice(0, 10).map(p => ({ label: p.name || p.title, value: Math.min(100, Math.max(0, p.progress * 100)) })), { unit: '%' })));
        root.append(grid);
    }
    if (page === 'Planification') {
        const tasks = active('tasks').filter(t => !done(t.status)), overdue = tasks.filter(t => dateKey(t.dueAt) && new Date(t.dueAt) < new Date());
        root.append(counter('Échéances dépassées', overdue.length, 'Tâches ouvertes chargées'), chart(Array.from({ length: 6 }, (_, index) => { const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + index * 7); const end = new Date(+start + 7 * 86400000); return { label: 'Semaine du ' + localDay(start), value: tasks.filter(t => dateKey(t.dueAt) && new Date(t.dueAt) >= start && new Date(t.dueAt) < end).length }; }), { title: 'Échéances des six prochaines semaines' }));
    }
    if (['Finance', 'Rentabilité'].includes(page)) {
        const values = active('projects').filter(p => number(p.budgetAmount ?? p.budget) !== null), currencies = [...new Set(values.map(p => p.currency || 'EUR'))];
        for (const currency of currencies) {
            const selected = values.filter(p => (p.currency || 'EUR') === currency);
            root.append(counter('Budgets prévisionnels · ' + currency, selected.reduce((n, p) => n + Number(p.budgetAmount ?? p.budget), 0), 'Budgets des projets chargés, distincts du revenu encaissé.'));
        }
        root.append(button('Ouvrir la comptabilité', { iconName: 'wallet', onClick: () => setRoute('finance', 'comptabilite') }));
    }
    if (page === 'Fichiers') {
        const docs = active('documents'), known = docs.filter(d => number(d.byteCount) !== null);
        root.append(counter('Volume renseigné', (known.reduce((n, d) => n + Number(d.byteCount), 0) / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Mo', known.length + ' fichiers avec taille renseignée sur ' + docs.length), chart(distribution(docs)), button('Ouvrir les fichiers', { iconName: 'folder', onClick: () => setRoute('documents') }));
    }
    if (page === 'Communication') {
        root.append(counter('Conversations non lues', active('conversations').filter(c => Number(c.unread) > 0).length, 'Conversations du compte chargé'));
        try {
            const data = await call('/v1/communications/overview');
            root.append(displayValue(data));
        }
        catch (error) {
            root.append(errorBox(error));
        }
        root.append(button('Ouvrir la bibliothèque', { iconName: 'image', onClick: () => setRoute('communications') }));
    }
    const special = { Produits: ['products', 'product-subscriptions', 'product-incidents', 'product-releases', 'product-versions'], Support: ['tickets'], 'Ressources humaines': ['employment-contracts', 'work-schedules', 'leave-requests', 'trainings'], Marketing: ['campaigns'] };
    for (const kind of special[page] || []) {
        try {
            const items = await listSpecialized(kind);
            root.append(card(labelFor(kind), 'Fiches autorisées, liste paginée par le serveur.', stack(counter('Fiches', items.length, 'Lignes récupérées'), chart(distribution(items)), dataTable({ rows: items, name: 'statistics-' + kind, columns: [{ id: 'title', label: 'Intitulé' }, { id: 'status', label: 'État', render: r => statusDotValue(r.status) }, { id: 'version', label: 'Version' }] }))));
        }
        catch (error) {
            root.append(card(labelFor(kind), '', errorBox(error)));
        }
    }
    if (page === 'Sécurité') {
        if (!['OWNER', 'ADMIN'].includes(String(state.user?.role).toUpperCase()))
            return emptyState('Accès réservé', 'Cette vue demande un compte administrateur.', 'lock');
        root.append(await renderBusinessPage('securityOperations', ''));
    }
    if (page === 'Sources et qualité')
        root.append(localInventory(['projects', 'missions', 'tasks', 'documents']), counter('Relevés historiques', (state.workspace?.enterprise?.metricSamples || []).length, 'Relevés chargés'), notice('La disponibilité d’un collecteur ne prouve pas la réception de ses événements. Consultez les sources des produits pour leur dernière réception.'), button('Examiner les sources produits', { iconName: 'sync', onClick: () => setRoute('dashboard', 'product-sources') }));
    if (page !== 'Évolution')
        root.append(h('h2', { text: 'Évolution et comparaison' }), history(timezone));
    return root;
}
function statusDotValue(value) { return h('span', { class: 'sq-status sq-tone-' + tone(value) }, h('i', { 'aria-hidden': 'true' }), h('span', { text: statusText(value) })); }
