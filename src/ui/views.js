// Visões em HTML do processo: linha do tempo, quadro por setor e lista. Mesmos dados, filtros, caminhos e seleção do mapa.
import { el, render } from './dom.js';
import { flowOrder, sectorMatrix } from '../state/layouts.js';
import { sectorClass } from './sectors.js';
import { SECTORS } from '../data/seed.js';
import { byId, personName, stageIssues, stageMatches, stageWaiting, pathRoute } from '../state/logic.js';

// Estado visual compartilhado por cartão: filtros (esmaece), caminho (numera / "passa por aqui"), seleção.
function ctxOf({ state, filters, pathId, selectedId }) {
  const path = state.paths.find((p) => p.id === pathId) || null, route = path ? pathRoute(state, path) : null;
  const ids = new Set(path?.steps.map((s) => s.stageId).filter(Boolean)), nums = {};
  path?.steps.forEach((s, i) => { if (s.stageId) (nums[s.stageId] ||= []).push(i + 1); });
  return { state, filters, selectedId, path, route, ids, nums };
}

export function stageCard(c, st, onSelect, { extra = [], cls = '' } = {}) {
  const { state } = c, iss = stageIssues(state, st), waiting = stageWaiting(state, st.id);
  const match = stageMatches(state, st, c.filters), inPath = !c.path || c.ids.has(st.id) || c.route.via.has(st.id);
  return el('button', {
    type: 'button', 'data-stage': st.id, 'aria-label': `${st.num ? `Etapa ${st.num}: ` : 'Ramal: '}${st.name}`,
    class: `list-card ${sectorClass(st.sector)} ${cls}${st.id === c.selectedId ? ' selected' : ''}${match && inPath ? '' : ' dim'}${iss.noOwner ? ' no-owner' : ''}${iss.blocked ? ' blocked' : ''}${c.path && c.ids.has(st.id) ? ' in-path' : ''}${c.route?.via.has(st.id) ? ' via' : ''}${st.kind === 'branch' ? ' branch' : ''}`,
    onClick: () => onSelect(st.id),
  },
    el('span', { class: 'badge-num', text: st.num ?? 'R' }),
    el('span', { class: 'lc-main' },
      el('strong', { text: st.name }),
      el('small', { class: 'muted', text: `${st.sector}${st.kind === 'branch' ? ' · Ramal' : ''} · ${iss.noOwner ? '⚠ Responsável: A definir' : personName(state, st.ownerId)}` }),
      c.route?.via.has(st.id) && el('small', { class: 'muted', text: '↪ o caminho passa por aqui' })),
    c.nums[st.id] && el('span', { class: 'step-badge', title: 'Posição no caminho selecionado', text: `#${c.nums[st.id].join(',')}` }),
    waiting.length > 0 && el('span', { class: 'alert wait', title: `Aguardando: ${waiting.map((w) => w.from.name).join(', ')}`, text: '⏳ aguarda' }),
    iss.overdue > 0 && el('span', { class: 'alert late', text: `⚠ ${iss.overdue} atrasada${iss.overdue > 1 ? 's' : ''}` }),
    iss.blocked > 0 && el('span', { class: 'alert block', text: `⛔ ${iss.blocked} bloq.` }),
    ...extra);
}

export function renderList(host, opts) {
  const c = ctxOf(opts);
  render(host, ...c.state.stages.map((st) => stageCard(c, st, opts.onSelect)));
}

// Linha do tempo: cada etapa mostra para onde o trabalho segue (⇄ = muda de setor, ↺ = retorno).
export function renderTimeline(host, opts) {
  const c = ctxOf(opts), { state } = c, d = {};
  render(host, el('ol', { class: 'timeline', 'data-testid': 'timeline' }, flowOrder(state).map((st) => {
    const out = state.edges.filter((e) => e.from === st.id);
    return el('li', { class: `tl-item ${sectorClass(st.sector)}${st.kind === 'branch' ? ' branch' : ''}`, 'data-sector': st.sector },
      el('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
      stageCard(c, st, opts.onSelect, { cls: 'tl-card' }),
      el('div', { class: 'tl-next' },
        out.length ? out.map((e) => {
          const to = byId(state.stages, e.to); if (!to) return null;
          const cross = to.sector !== st.sector;
          return el('button', { type: 'button', class: `chip link tl-link${cross ? ' handoff' : ''}${e.loop ? ' loop' : ''}`, 'data-next': to.id, onClick: () => opts.onSelect(to.id),
            title: cross ? `Transferência de responsabilidade: ${st.sector} → ${to.sector}` : '', text: `${e.loop ? '↺ retorna para' : cross ? '⇄' : '→'} ${to.num ? `${to.num}. ` : ''}${to.name}${cross ? ` (${st.sector} → ${to.sector})` : ''}` });
        }) : el('span', { class: 'muted small', text: 'Fim do fluxo' })));
  })));
}

// Quadro por setor: uma coluna por setor, com as etapas na ordem do fluxo e o resumo de pendências do setor.
export function renderBoard(host, opts) {
  const c = ctxOf(opts), { state } = c, order = flowOrder(state);
  const sectors = [...SECTORS.filter((s) => state.stages.some((x) => x.sector === s)), ...new Set(state.stages.map((s) => s.sector).filter((s) => !SECTORS.includes(s)))];
  render(host, el('div', { class: 'board', 'data-testid': 'board' }, sectors.map((sec) => {
    const list = order.filter((s) => s.sector === sec), noOwner = list.filter((s) => !s.ownerId).length;
    const open = list.reduce((n, s) => n + stageIssues(state, s).open, 0), late = list.reduce((n, s) => n + stageIssues(state, s).overdue, 0);
    return el('section', { class: `board-col ${sectorClass(sec)}`, 'data-sector': sec },
      el('header', {}, el('h3', { text: sec }), el('p', { class: 'muted small', text: `${list.length} etapa${list.length > 1 ? 's' : ''} · ${open} tarefa${open === 1 ? '' : 's'} aberta${open === 1 ? '' : 's'}${late ? ` · ⚠ ${late} atrasada${late > 1 ? 's' : ''}` : ''}${noOwner ? ` · ${noOwner} sem responsável` : ''}` })),
      el('div', { class: 'board-cards' }, list.map((st) => stageCard(c, st, opts.onSelect))));
  })));
}

// Matriz setor × etapa: quem EXECUTA cada etapa (●), quem recebe a entrega dela (→) e de quem ela recebe (←).
export function renderMatrix(host, opts) {
  const c = ctxOf(opts), { state } = c, M = sectorMatrix(state), byIdMap = Object.fromEntries(state.stages.map((x) => [x.id, x]));
  const nm = (id) => { const x = byIdMap[id]; return `${x?.num ? `${x.num}. ` : ''}${x?.name ?? ''}`; };
  const head = (st) => {
    const match = stageMatches(state, st, c.filters), inPath = !c.path || c.ids.has(st.id) || c.route.via.has(st.id);
    return el('th', { scope: 'col', class: sectorClass(st.sector) },
      el('button', { type: 'button', 'data-stage': st.id, class: `mx-head ${sectorClass(st.sector)}${st.id === c.selectedId ? ' selected' : ''}${match && inPath ? '' : ' dim'}${c.path && c.ids.has(st.id) ? ' in-path' : ''}${c.route?.via.has(st.id) ? ' via' : ''}`, title: `${nm(st.id)} — ${st.sector}`, 'aria-label': `${st.num ? `Etapa ${st.num}: ` : 'Ramal: '}${st.name} (${st.sector})`, onClick: () => opts.onSelect(st.id) },
        el('span', { class: 'badge-num', text: st.num ?? 'R' }), el('span', { text: st.name }), c.nums[st.id] && el('span', { class: 'step-badge', text: `#${c.nums[st.id].join(',')}` })));
  };
  const cell = (sector, st) => {
    const k = M.cells[`${sector}|${st.id}`], iss = stageIssues(state, st), match = stageMatches(state, st, c.filters), inPath = !c.path || c.ids.has(st.id) || c.route.via.has(st.id);
    const base = `mx-cell ${sectorClass(sector)}${match && inPath ? '' : ' dim'}`;
    if (!k.roles.length) return el('td', {}, el('span', { class: 'mx-cell empty', 'aria-hidden': 'true', text: '' }));
    const parts = [];
    if (k.roles.includes('executa')) parts.push(el('span', { class: 'mk', 'aria-hidden': 'true', text: '●' }), el('span', { text: 'Executa' }), el('span', { text: iss.noOwner ? '⚠ A definir' : personName(state, st.ownerId) }),
      (iss.overdue || iss.blocked || iss.open) ? el('span', { text: `${iss.open} aberta${iss.open === 1 ? '' : 's'}${iss.overdue ? ` · ⚠ ${iss.overdue} atras.` : ''}${iss.blocked ? ` · ⛔ ${iss.blocked}` : ''}` }) : null);
    if (k.roles.includes('entrega')) parts.push(el('span', { class: 'mk', 'aria-hidden': 'true', text: '→' }), el('span', { text: `Entrega para este setor${k.deliversTo.some((x) => x.loop) ? ' (retorno ↺)' : ''}` }));
    if (k.roles.includes('recebe')) parts.push(el('span', { class: 'mk', 'aria-hidden': 'true', text: '←' }), el('span', { text: 'Recebe deste setor' }));
    const tip = [k.roles.includes('executa') && `${sector} executa: ${nm(st.id)}`, k.deliversTo.length && `${nm(st.id)} entrega para ${k.deliversTo.map((x) => nm(x.id)).join('; ')}`, k.receivesFrom.length && `${nm(st.id)} recebe de ${k.receivesFrom.map((x) => nm(x.id)).join('; ')}`].filter(Boolean).join(' · ');
    return el('td', {}, el('button', { type: 'button', class: `${base} ${k.roles.join(' ')}${k.roles.includes('executa') && iss.noOwner ? ' noowner' : ''}`, title: tip, 'aria-label': `${sector}, ${nm(st.id)}: ${k.roles.map((r) => ({ executa: 'executa', entrega: 'entrega para este setor', recebe: 'recebe deste setor' })[r]).join(' e ')}`, 'data-cell': `${sector}|${st.id}`, onClick: () => opts.onSelect(st.id) }, parts));
  };
  render(host, el('div', { 'data-testid': 'matrix' },
    el('ul', { class: 'mx-legend', 'aria-label': 'Legenda da matriz' },
      el('li', {}, el('b', { text: '●' }), ' Executa a etapa'), el('li', {}, el('b', { text: '→' }), ' Entrega trabalho para o setor'), el('li', {}, el('b', { text: '←' }), ' Recebe trabalho do setor'),
      el('li', { class: 'muted', text: 'Linhas = setores · colunas = etapas na ordem do fluxo · clique para abrir a etapa.' })),
    el('div', { class: 'matrix-wrap' }, el('table', { class: 'matrix' },
      el('thead', {}, el('tr', {}, el('th', { class: 'corner', scope: 'col', text: 'Setor ╲ Etapa' }), M.cols.map(head), el('th', { scope: 'col', text: 'Resumo do setor' }))),
      el('tbody', {}, M.rows.map((sector) => {
        const mine = M.cols.filter((x) => x.sector === sector), open = mine.reduce((n, x) => n + stageIssues(state, x).open, 0), late = mine.reduce((n, x) => n + stageIssues(state, x).overdue, 0), noOwn = mine.filter((x) => !x.ownerId).length;
        const outs = M.cols.reduce((n, x) => n + M.cells[`${sector}|${x.id}`].deliversTo.length, 0), ins = M.cols.reduce((n, x) => n + M.cells[`${sector}|${x.id}`].receivesFrom.length, 0);
        return el('tr', { 'data-sector': sector },
          el('th', { scope: 'row', class: sectorClass(sector) }, sector, el('small', { text: `${mine.length} etapa${mine.length === 1 ? '' : 's'} · ${open} tarefa${open === 1 ? '' : 's'} aberta${open === 1 ? '' : 's'}${late ? ` · ⚠ ${late} atrasada${late > 1 ? 's' : ''}` : ''}` })),
          M.cols.map((st) => cell(sector, st)),
          el('td', { class: 'tot' }, `${noOwn ? `⚠ ${noOwn} sem responsável · ` : ''}recebe ${ins} · entrega ${outs}`));
      }))))));
}
