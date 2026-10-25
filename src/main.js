import { createStore } from './state/store.js';
import { todayISO, pathRoute, computeIndicators, EMPTY_FILTERS, hasFilters, stageMatches, stageIssues, personName, byId, isOverdue } from './state/logic.js';
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
import { initTheme } from './ui/theme.js';

let storage = null;
try { storage = window.localStorage; storage.getItem('x'); } catch { storage = null; }
const store = createStore({ storage });
if (!storage) setTimeout(() => toast('Armazenamento do navegador indisponível: alterações não serão salvas. Use Exportar.', 'error'), 300);

const isNarrow = window.matchMedia('(max-width: 760px)').matches;
const ui = { kpiOpen: { oper: !isNarrow, gestao: !isNarrow }, view: 'mapa', filters: { ...EMPTY_FILTERS }, selected: null, tab: 'resumo', pathId: '', impFilter: '', recFilter: '', routine: { person: '', day: todayISO(), groups: [] }, layout: window.matchMedia('(max-width: 1100px)').matches ? 'lista' : 'mapa' };
const $ = (id) => document.getElementById(id);

// Tom do indicador: nunca só cor — sempre acompanhado de ícone e rótulo ("Atenção", "Crítico", "Em dia", "Sem dados").
const TONES = {
  danger: ['⚠', 'Crítico'], warn: ['⚠', 'Atenção'], ok: ['✔', 'Em dia'], none: ['', ''],
};
function toneOf(key, i) {
  if (i.value === null) return 'nodata';
  const bad = { tasksOverdue: 'danger', 'extra-blocked': 'danger', 'extra-noowner': 'warn', 'extra-waiting': 'warn', equipmentDown: 'warn', financePending: 'warn' }[key];
  if (bad) return i.value > 0 ? bad : 'ok';
  return 'none';
}

function renderIndicators() {
  const s = store.get(), ind = computeIndicators(s), ex = ind.extra;
  const tile = (key, i) => {
    const tone = toneOf(key, i), [icon, word] = TONES[tone] || ['', ''];
    return el('button', { type: 'button', class: `kpi${i.value === null ? ' nodata' : ''}${TONES[tone] && tone !== 'none' ? ` tone-${tone}` : ''}`, 'data-kpi': key, title: 'Clique para ver os registros', onClick: () => showItems({ ...i, key: i.key || key }) },
      el('span', { class: 'kpi-val', text: i.value === null ? '—' : String(i.value) }),
      el('span', { class: 'kpi-lbl', text: i.label }),
      i.value === null ? el('span', { class: 'kpi-tone', text: 'Sem dados registrados' }) : (icon ? el('span', { class: 'kpi-tone', text: `${icon} ${word}` }) : i.manual ? el('span', { class: 'kpi-tone', text: 'valor manual' }) : null));
  };
  const group = (id, title, tiles) => el('details', { class: 'kpi-group', open: ui.kpiOpen[id], onToggle: (e) => { ui.kpiOpen[id] = e.target.open; } },
    el('summary', { text: title }), el('div', { class: 'kpi-row' }, tiles));
  append(clear($('kpis')),
    group('oper', 'Operação comercial', ['quotesOpen', 'quotesAwaiting', 'rentalsActive', 'deliveriesPlanned', 'financePending', 'equipmentDown', 'maintenancePending'].map((k) => tile(k, ind[k]))),
    group('gestao', 'Gestão de tarefas e equipe', [tile('extra-open', ex.open), tile('tasksOverdue', ind.tasksOverdue), tile('extra-blocked', ex.blocked), tile('extra-noowner', ex.noOwner),
      tile('extra-waiting', ex.waiting), tile('extra-problems', ex.problems), tile('improvementsReview', ind.improvementsReview)]));
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
      el('li', {}, el('button', { type: 'button', class: 'chip link', text: st.label, disabled: !st.stageId, onClick: () => open(st.stageId) })))),
    path && pathRoute(s, path).via.size ? el('p', { class: 'muted small path-hint', 'data-testid': 'path-hint', text: `Etapas com a marca "passa por aqui" (${[...pathRoute(s, path).via].map((id) => byId(s.stages, id)?.name).join('; ')}) são atravessadas pelo fluxo geral entre dois passos deste caminho. Ajuste as ligações se não se aplicarem.` }) : null);
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
  const focusStage = document.activeElement?.classList?.contains('list-card') ? document.activeElement.dataset.stage : null;
  $('boot')?.remove();
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
    else { renderList(); if (focusStage) $('stage-list').querySelector(`[data-stage="${focusStage}"]`)?.focus({ preventScroll: true }); }
    renderPanelNow();
    const panelOpen = Boolean(ui.selected);
    if (asMap && (panelOpen !== ui.wasOpen || ui.selected !== ui.lastSel)) $('map').__fit?.(false); // painel abre/fecha ou outra etapa: reenquadra/centraliza
    ui.lastSel = ui.selected;
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
$('map').addEventListener('click', () => {
  if ($('map').__moved) { $('map').__moved = false; return; } // foi um arrasto, não um clique
  if (ui.selected) { ui.selected = null; render(); }
});

$('btn-export').onclick = () => {
  const a = el('a', { href: URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' })), download: `itasul-painel-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove(); toast('Backup exportado.', 'success');
};
$('file-import').addEventListener('change', async (ev) => {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  try {
    if (!(await confirmDialog('Importar vai substituir os dados atuais. Uma cópia de segurança será guardada antes. Continuar?'))) return;
    store.importJSON(await file.text()); toast('Dados importados. Cópia anterior guardada.', 'success');
  } catch (e) { toast(`Importação cancelada: ${e.message}`, 'error'); }
});
$('btn-restore').onclick = async () => {
  try { if (!store.hasBackup()) throw new Error('Não há cópia de segurança.'); if (await confirmDialog('Restaurar a última cópia de segurança (antes da última importação/reinício)?')) { store.restoreBackup(); toast('Cópia de segurança restaurada.', 'success'); } } catch (e) { toast(e.message, 'error'); }
};
$('btn-reset').onclick = async () => { if (await confirmDialog('Reiniciar o painel com os dados iniciais? Seus dados atuais ficam guardados em uma cópia de segurança.')) { store.reset(); ui.selected = null; toast('Painel reiniciado.', 'success'); } };

// Tema claro/escuro (preferência salva > sistema)
const theme = initTheme({ button: $('theme-toggle') });
$('btn-system-theme').onclick = () => { theme.followSystem(); $('data-menu').open = false; toast('Tema do sistema ativado.', 'success'); };
// Menu "Dados": fecha ao clicar fora ou com Esc
document.addEventListener('click', (ev) => { const m = $('data-menu'); if (m.open && !m.contains(ev.target)) m.open = false; });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { const m = $('data-menu'); if (m.open) { m.open = false; m.querySelector('summary').focus(); } } });
// Confirmação de sucesso para cada alteração gravada
let lastHistory = store.get().history[0]?.id;
store.subscribe((st) => { const h = st.history[0]; if (h && h.id !== lastHistory) { lastHistory = h.id; toast(h.text, 'success'); } });

store.subscribe(render);
render();
window.__itasul = { store, ui }; // facilita depuração e testes
