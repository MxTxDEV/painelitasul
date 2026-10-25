// Registros operacionais: base real dos indicadores (orçamentos, locações, entregas, pendências, equipamentos).
// Intencionalmente sem valores financeiros e sem dados pessoais: use uma identificação curta (ex.: "Obra Rua X").
import { el, render, confirmDialog, fmtDate } from './dom.js';
import { openForm, options } from './form.js';
import { RECORD_KINDS, RECORD_STATUSES } from '../data/seed.js';
import { byId, personName } from '../state/logic.js';

export function recordForm(store, rec, preset = {}) {
  const s = store.get();
  openForm({
    title: rec ? 'Editar registro' : 'Novo registro', values: rec || preset,
    fields: [
      { name: 'kind', label: 'Tipo', type: 'select', options: options(RECORD_KINDS) },
      { name: 'title', label: 'Identificação', required: true, hint: 'Descrição curta. Evite dados pessoais e valores financeiros.' },
      { name: 'status', label: 'Status', type: 'select', options: options(RECORD_STATUSES) },
      { name: 'date', label: 'Data (prevista ou de referência)', type: 'date' },
      { name: 'stageId', label: 'Etapa relacionada', type: 'select', options: options(s.stages.map((x) => ({ value: x.id, label: x.name })), { blank: 'Nenhuma' }) },
      { name: 'ownerId', label: 'Responsável', type: 'select', options: options(s.employees.map((e) => ({ value: e.id, label: e.name })), { blank: 'A definir' }) },
      { name: 'notes', label: 'Observações', type: 'textarea', rows: 2 },
    ],
    onSubmit: (v) => {
      const d = { ...v, stageId: v.stageId || null, ownerId: v.ownerId || null };
      if (rec) store.updateRecord(rec.id, d); else store.addRecord(d);
    },
    onDelete: rec ? async () => { if (await confirmDialog('Excluir este registro?')) { store.deleteRecord(rec.id); return true; } return false; } : null,
  });
}

export const recordLine = (s, r) =>
  `${r.kind} · ${r.status}${r.date ? ` · ${fmtDate(r.date)}` : ''}${r.stageId ? ` · ${byId(s.stages, r.stageId)?.name ?? ''}` : ''} · ${personName(s, r.ownerId)}`;

export function renderRecords(host, { store, kindFilter, onFilter, onOpenStage }) {
  const s = store.get();
  const list = s.records.filter((r) => !kindFilter || r.kind === kindFilter);
  render(host,
    el('div', { class: 'view-head' },
      el('div', {}, el('h2', { text: 'Registros operacionais' }),
        el('p', { class: 'muted', text: 'Estes registros alimentam os indicadores do topo. Nada foi pré-cadastrado: o painel só conta o que você registrar.' })),
      el('button', { class: 'btn primary', type: 'button', 'data-testid': 'add-record', text: '+ Novo registro', onClick: () => recordForm(store, null, kindFilter ? { kind: kindFilter } : {}) })),
    el('label', { class: 'inline-filter' }, 'Tipo: ',
      el('select', { 'aria-label': 'Filtrar registros por tipo', onChange: (e) => onFilter(e.target.value) },
        options(RECORD_KINDS, { blank: 'Todos' }).map((o) => el('option', { value: o.value, text: o.label, selected: o.value === kindFilter })))),
    list.length ? el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ['Tipo', 'Identificação', 'Status', 'Data', 'Etapa', 'Responsável', ''].map((h) => el('th', { text: h })))),
      el('tbody', {}, list.map((r) => el('tr', { 'data-testid': 'record-row' },
        el('td', { text: r.kind }), el('td', { text: r.title }), el('td', { text: r.status }), el('td', { text: fmtDate(r.date) || '—' }),
        el('td', {}, r.stageId ? el('button', { class: 'chip link', type: 'button', text: byId(s.stages, r.stageId)?.name ?? '—', onClick: () => onOpenStage(r.stageId) }) : '—'),
        el('td', { class: r.ownerId ? '' : 'undef', text: personName(s, r.ownerId) }),
        el('td', {}, el('button', { class: 'btn small', type: 'button', text: 'Editar', onClick: () => recordForm(store, r) }))))))
    ) : el('p', { class: 'empty', text: s.records.length ? 'Nenhum registro com esse tipo.' : 'Nenhum registro cadastrado. Sem dados registrados nos indicadores correspondentes.' }));
}
