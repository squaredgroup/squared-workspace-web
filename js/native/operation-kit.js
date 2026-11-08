import { state, setRoute, subscribe } from '../store.js';
import { h, button, field, input, select, textarea, card, emptyState, errorMessage, toast, modal as unscopedModal } from '../ui.js';
import { hasAny, scope, statusDot, confirmDialog, downloadBlob } from './components.js';
import { call } from './api.js';
export { state, setRoute, h, button, field, input, select, textarea, card, emptyState, errorMessage, toast, hasAny, scope, statusDot, confirmDialog, downloadBlob, call };
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const rows = key => (state.workspace?.[key] || []).map(row => ({ ...row, ...row.payload }));
export const choices = (items, blank = 'Choisir') => [{ value: '', label: blank }, ...items.map(row => ({ value: row.id, label: row.name || row.title || row.email || 'Sans titre' }))];
export const stack = (...nodes) => h('div', { class: 'sq-pane' }, ...nodes);
export const actions = (...nodes) => h('div', { class: 'sq-operation-actions' }, ...nodes.filter(Boolean));
export const notice = (text, tone = 'information') => h('div', { class: 'sq-inline-notice sq-operation-notice ' + tone, role: tone === 'error' ? 'alert' : 'status' }, text);
export const toggle = (title, checked, change) => { const control = input('', { type: 'checkbox' }); control.checked = !!checked; control.addEventListener('change', () => change(control.checked)); return field(title, control); };
export const term = value => ({ pending: 'En attente', approved: 'Approuvé', rejected: 'Refusé', cancelled: 'Annulé', all: 'Tous', any: 'Un accord suffit', in: 'Entrée', out: 'Sortie', active: 'Actif', draft: 'Brouillon' })[value] || String(value || 'À renseigner');
export function bind(control, change, event = 'input') { control.addEventListener(event, () => change(control.value)); return control; }
export function lifecycle(root, dispose) {
    let mounted = false, ended = false, unwatch;
    const account = scope(), route = JSON.stringify(state.route);
    const stop = () => { if (ended)
        return; ended = true; observer.disconnect(); unwatch?.(); window.removeEventListener('sq:session-reset', stop); dispose(); };
    const observer = new MutationObserver(() => { if (root.isConnected)
        mounted = true;
    else if (mounted)
        stop(); });
    observer.observe(document.body, { subtree: true, childList: true });
    unwatch = subscribe(() => { if (scope() !== account || JSON.stringify(state.route) !== route)
        stop(); });
    window.addEventListener('sq:session-reset', stop);
    return stop;
}
export function scopeSignal() { const owner = scope(), controller = new AbortController(); return { signal: controller.signal, owner, valid: () => scope() === owner && !controller.signal.aborted, stop: () => controller.abort() }; }
export async function listStudio(kind = '', extra = {}) { const query = new URLSearchParams({ includeViews: 'true', ...(kind ? { kind } : {}), ...extra }); const data = await call('/v1/studio/documents?' + query); return data.documents || []; }
export function block(kind = 'text', text = '') { return { id: uid(), kind, text, checked: false, referenceID: null, url: '' }; }
export function blankDoc(kind = 'page', title = 'Nouvelle page', projectID = null) { return { id: uid(), kind, title, projectID, entityKind: null, entityID: null, shared: false, version: 0, content: { blocks: [], values: {}, questions: [], target: 'task', description: '', exposed: [], allowComments: true, allowValidation: false, showProgress: true, costs: [], revenue: 0, contingency: 0, currency: 'EUR' } }; }
export async function saveDoc(doc) { return (await call('/v1/studio/documents/' + doc.id, { method: 'PUT', body: doc })).document; }
export async function privateID(key) { const user = state.user || {}, seed = String(user.organizationID || user.organizationId || user.organization_id || '').toUpperCase() + ':' + String(user.id || '').toUpperCase() + ':' + key; const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed))); bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128; const hex = [...bytes.slice(0, 16)].map(v => v.toString(16).padStart(2, '0')).join(''); return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-'); }
export class PrivatePreferences {
    constructor(key) { this.key = key; this.document = null; this.loaded = false; this.owner = scope(); }
    async load(fallback) {
        const docs = await listStudio('view');
        if (scope() !== this.owner)
            throw Error('Le compte a changé.');
        this.document = docs.find(d => !d.shared && d.ownerID === state.user.id && d.content?.viewScope === this.key) || null;
        const raw = this.document?.content?.values?.['5af9a3cf-124c-4b7d-94ce-cf4114500001'];
        const value = raw ? JSON.parse(raw) : clone(fallback);
        this.loaded = true;
        return value;
    }
    async save(value) {
        if (!this.loaded || scope() !== this.owner)
            throw Error('Relisez vos préférences avant cet enregistrement.');
        const text = JSON.stringify(value);
        if (new TextEncoder().encode(text).length > 20000)
            throw Error('Cette préférence dépasse la taille autorisée.');
        const next = this.document ? clone(this.document) : blankDoc('view', 'Préférences · ' + this.key);
        if (!this.document)
            next.id = await privateID(this.key);
        next.shared = false;
        next.content.viewScope = this.key;
        next.content.values = { '5af9a3cf-124c-4b7d-94ce-cf4114500001': text };
        this.document = await saveDoc(next);
        return value;
    }
}
export function readOnlyTable(items, columns, onOpen) { return import('./components.js').then(({ dataTable }) => dataTable({ rows: items, columns, onOpen, name: 'operations-' + uid(), search: true })); }
export function resultCard(title, detail, controls = []) { return card(title, detail, actions(...controls)); }
export function errorBox(error) { return notice(errorMessage(error), 'error'); }
export function modal(options) {
    const owner = accessScope();
    let force = false, unwatch;
    const dialog = unscopedModal({ ...options, beforeClose: () => force || options.beforeClose?.() !== false, onClose: () => { unwatch?.(); options.onClose?.(); } });
    unwatch = subscribe(() => {
        if (accessScope() !== owner) {
            force = true;
            dialog.close();
        }
    });
    return dialog;
}
function accessScope() { return scope() + '|' + String(state.user?.role || '') + '|' + [...(state.user?.permissions || [])].sort().join(','); }
