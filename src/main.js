import { createStore } from './state/store.js';
import { todayISO, computeIndicators, EMPTY_FILTERS, hasFilters, stageMatches, stageIssues, personName, byId, isOverdue } from './state/logic.js';
import { SECTORS, STATUSES, PRIORITIES, METRIC_DEFS } from './data/seed.js';
import { el, append, clear, toast, confirmDialog, fmtDate } from './ui/dom.js';
import { openForm, options } from './ui/form.js';
import { renderMap, mapControls } from './ui/map.js';
import { renderPanel, stageForm } from './ui/panel.js';
import { taskForm } from './ui/tasks.js';
import { renderTeam } from './ui/team.js';
import { renderImprovements } from './ui/improvements.js';
import { renderRecords, recordForm, recordLine } from './ui/records.js';
import { renderRoutine } from './ui/routine.js';

let storage = null;
try { storage = window.localStorage; storage.getItem('x'); } catch { storage = null; }
const store = createStore({ storage });
if (!storage) setTimeout(() => toast('Armazenamento do navegador indisponível: alterações não serão salvas. Use Exportar.', true), 300);

const ui = { view: 'mapa', filters: { ...EMPTY_FILTERS }, selected: null, tab: 'resumo', pathId: '', impFilter: '', recFilter: '', routine: { person: '', day: todayISO(), groups: [] }, layout: window.matchMedia('(max-width: 760px)').matches ? 'lista' : 'mapa' };
const $ = (id) => document.getElementById(id);

function renderIndicators() {
  const s = store.get(), ind = computeIndicators(s);
  const tile = (i, onClick, extraCls = '') => el('button', { type: 'button', class: `kpi${i.value === null ? ' nodata' : ''}${extraCls}`, 'data-kpi': i.key, onClick },
    el('span', { class: 'kpi-val', text: i.value === null ? 'Sem dados registrados' : String(i.value) }), el('span', { class: 'kpi-lbl', text: i.label }));
  const main = METRIC_DEFS.map((d) => {
    const i = ind[d.key];
    return tile(i, () => showItems(i), i.value > 0 && d.key === 'tasksOverdue' ? ' hot' : '');
  });
  const ex = ind.extra;
  const extra = [['open', 'extra-open'], ['blocked', 'extra-blocked'], ['noOwner', 'extra-noowner'], ['waiting', 'extra-waiting'], ['problems', 'extra-problems']].map(([k, key]) =>
    tile({ ...ex[k], key }, () => showItems(ex[k]), (k === 'noOwner' && ex[k].value > 0) || (k === 'blocked' && ex[k].value > 0) ? ' hot' : ''));
  $('kpis').replaceChildren(...main, ...extra);
}

function editMetric(def) {
  openForm({
    title: `${def.label} — valor manual`, values: { value: store.get().metrics[def.key] ?? '' },
    fields: [{ name: 'value', label: 'Valor informado manualmente', type: 'number', hint: 'Só vale enquanto não houver registros desse tipo. Deixe vazio para voltar a "Sem dados registrados".' }],
    onSubmit: (v) => store.setMetric(def.key, v.value),
  });
}

function showItems(i) {
  const s = store.get();
  const items = [];
  (i.tasks || []).forEach((t) => items.push(el('li', {}, el('button', { class: 'chip link', type: 'button', text: t.title, onClick: () => { d.close(); open(t.stageId, 'tarefas'); } }),
    ` — ${byId(s.stages, t.stageId)?.name || ''} · ${t.status} · ${personName(s, t.ownerId)}${t.due ? ` · prazo ${fmtDate(t.due)}` : ''}${isOverdue(t) ? ' · ATRASADA' : ''}`)));
  (i.stages || []).forEach((st) => items.push(el('li', {}, el('button', { class: 'chip link', type: 'button', text: `${st.num ?? 'R'}. ${st.name}`, onClick: () => { d.close(); open(st.id, 'resumo'); } }), ` — ${st.sector}`)));
  (i.records || []).forEach((r) => items.push(el('li', {}, el('strong', { text: `${r.title} ` }), el('span', { class: 'muted', text: recordLine(s, r) }), ' ',
    el('button', { class: 'btn small', type: 'button', text: 'Editar', onClick: () => { d.close(); recordForm(store, r); } }))));
  (i.improvements || []).forEach((m) => items.push(el('li', { text: m.title })));
  const def = METRIC_DEFS.find((x) => x.key === i.key);
  const d = el('dialog', { class: 'modal' }, el('h2', { text: i.label }),
    items.length ? el('ul', { class: 'list', 'data-testid': 'ind-items' }, items) : el('p', { class: 'muted', text: i.value === null ? 'Sem dados registrados.' : 'Nenhum item.' }),
    i.manual && el('p', { class: 'muted', text: `Valor informado manualmente (${i.value}); não há registros de ${i.kind}.` }),
    el('div', { class: 'actions' },
      i.kind && el('button', { class: 'btn', type: 'button', 'data-testid': 'ind-new-record', text: `+ Registrar ${i.kind.toLowerCase()}`, onClick: () => { d.close(); recordForm(store, null, { kind: i.kind }); } }),
      def?.manual && !(i.records || []).length && el('button', { class: 'btn', type: 'button', 'data-testid': 'ind-manual', text: 'Informar valor manual', onClick: () => { d.close(); editMetric(def); } }),
      el('button', { class: 'btn', type: 'button', text: 'Fechar', onClick: () => d.close() })));
  d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
}

function renderFilters() {
  const s = store.get(), f = ui.filters;
  const sel = (key, label, opts) => el('label', { class: 'filter' }, el('span', { text: label }),
    el('select', { 'data-filter': key, onChange: (e) => { ui.filters[key] = e.target.value; render(); } },
      opts.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === f[key] }))));
  append(clear($('filters')),
    sel('sector', 'Setor', options(SECTORS, { blank: 'Todos' })),
    sel('person', 'Responsável', [{ value: '', label: 'Todos' }, { value: '__none', label: 'A definir' }, ...s.employees.map((e) => ({ value: e.id, label: e.name }))]),
    sel('status', 'Status', options(STATUSES, { blank: 'Todos' })),
    sel('priority', 'Prioridade', options(PRIORITIES, { blank: 'Todas' })),
    hasFilters(f) && el('button', { class: 'btn small', type: 'button', 'data-testid': 'clear-filters', text: 'Limpar filtros', onClick: () => { ui.filters = { ...EMPTY_FILTERS }; render(); } }));
}

function renderPaths() {
  const s = store.get();
  const path = s.paths.find((p) => p.id === ui.pathId);
  const pick = (id, name) => el('button', { type: 'button', class: `seg${ui.pathId === id ? ' active' : ''}`, 'data-path': id, 'aria-pressed': String(ui.pathId === id), text: name, onClick: () => { ui.pathId = id; render(); } });
  append(clear($('paths')),
    el('span', { class: 'lbl', text: 'Caminho:' }), pick('', 'Visão geral'), s.paths.map((p) => pick(p.id, p.name)),
    path && el('ol', { class: 'steps', 'data-testid': 'path-steps' }, path.steps.map((st) =>
      el('li', {}, el('button', { type: 'button', class: 'chip link', text: st.label, disabled: !st.stageId, onClick: () => open(st.stageId) })))));
}

function renderList() {
  const s = store.get(), host = $('stage-list');
  host.replaceChildren(...s.stages.map((st) => {
    const iss = stageIssues(s, st), match = stageMatches(s, st, ui.filters);
    return el('button', { type: 'button', class: `list-card${match ? '' : ' dim'}${iss.noOwner ? ' no-owner' : ''}`, 'data-stage': st.id, onClick: () => open(st.id) },
      el('span', { class: 'badge-num', text: st.num ?? 'R' }),
      el('span', { class: 'lc-main' }, el('strong', { text: st.name }), el('small', { class: 'muted', text: `${st.sector} · ${iss.noOwner ? '⚠ Responsável: A definir' : personName(s, st.ownerId)}` })),
      iss.overdue > 0 && el('span', { class: 'alert late', text: `${iss.overdue} atrasada(s)` }));
  }));
}

function open(stageId, tab = 'resumo') { ui.view = 'mapa'; ui.selected = stageId; ui.tab = tab; render(); }

function renderPanelNow() {
  const host = $('panel');
  renderPanel(host, {
    store, stageId: ui.selected, tab: ui.tab,
    onTab: (t) => { ui.tab = t; renderPanelNow(); },
    onClose: () => { ui.selected = null; render(); },
    onEditStage: () => stageForm(store, byId(store.get().stages, ui.selected), { onDeleted: () => { ui.selected = null; } }),
    onNewTask: () => taskForm(store, byId(store.get().stages, ui.selected)),
    onOpenStage: (id) => open(id, ui.tab),
  });
  document.body.classList.toggle('panel-open', Boolean(ui.selected && byId(store.get().stages, ui.selected)));
}

function render() {
  if (ui.selected && !byId(store.get().stages, ui.selected)) ui.selected = null;
  document.querySelectorAll('[data-view]').forEach((b) => { const on = b.dataset.view === ui.view; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${ui.view}`; });
  renderIndicators();
  if (ui.view === 'mapa') {
    renderFilters(); renderPaths();
    const asMap = ui.layout === 'mapa';
    $('map').hidden = !asMap; $('stage-list').hidden = asMap; $('map-tools').hidden = !asMap;
    $('layout-toggle').textContent = asMap ? 'Ver como lista' : 'Ver como mapa';
    if (asMap) renderMap($('map'), { state: store.get(), filters: ui.filters, selectedId: ui.selected, pathId: ui.pathId, onSelect: (id) => open(id) });
    else renderList();
    renderPanelNow();
    const panelOpen = Boolean(ui.selected);
    if (asMap && panelOpen !== ui.wasOpen) mc.fit(); // o painel muda a largura do mapa: reenquadra
    ui.wasOpen = panelOpen;
  } else {
    document.body.classList.remove('panel-open'); $('panel').hidden = true;
    if (ui.view === 'equipe') renderTeam($('view-equipe'), { store, onOpenStage: (id) => open(id), onOpenRoutine: (id) => { ui.routine.person = id; ui.view = 'rotina'; render(); } });
    if (ui.view === 'rotina') renderRoutine($('view-rotina'), { store, routine: ui.routine, onChange: (p) => { Object.assign(ui.routine, p); render(); }, onOpenStage: (id) => open(id, 'tarefas') });
    if (ui.view === 'registros') renderRecords($('view-registros'), { store, kindFilter: ui.recFilter, onFilter: (v) => { ui.recFilter = v; render(); }, onOpenStage: (id) => open(id) });
    if (ui.view === 'melhorias') renderImprovements($('view-melhorias'), { store, statusFilter: ui.impFilter, onFilter: (v) => { ui.impFilter = v; render(); } });
  }
}

// --- eventos estáticos ---
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { ui.view = b.dataset.view; render(); }));
const mc = mapControls($('map'));
$('zoom-in').onclick = mc.zoomIn; $('zoom-out').onclick = mc.zoomOut; $('zoom-fit').onclick = mc.fit;
$('layout-toggle').onclick = () => { ui.layout = ui.layout === 'mapa' ? 'lista' : 'mapa'; render(); };
$('add-stage').onclick = () => stageForm(store, null);
$('map').addEventListener('click', () => { if (ui.selected) { ui.selected = null; render(); } });

$('btn-export').onclick = () => {
  const a = el('a', { href: URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' })), download: `itasul-painel-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove(); toast('Backup exportado.');
};
$('file-import').addEventListener('change', async (ev) => {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  try {
    if (!(await confirmDialog('Importar vai substituir os dados atuais. Uma cópia de segurança será guardada antes. Continuar?'))) return;
    store.importJSON(await file.text()); toast('Dados importados. Cópia anterior guardada.');
  } catch (e) { toast(`Importação cancelada: ${e.message}`, true); }
});
$('btn-restore').onclick = async () => {
  try { if (!store.hasBackup()) throw new Error('Não há cópia de segurança.'); if (await confirmDialog('Restaurar a última cópia de segurança (antes da última importação/reinício)?')) { store.restoreBackup(); toast('Restaurado.'); } } catch (e) { toast(e.message, true); }
};
$('btn-reset').onclick = async () => { if (await confirmDialog('Reiniciar o painel com os dados iniciais? Seus dados atuais ficam guardados em uma cópia de segurança.')) { store.reset(); ui.selected = null; toast('Painel reiniciado.'); } };

store.subscribe(render);
render();
window.__itasul = { store, ui }; // facilita depuração e testes
