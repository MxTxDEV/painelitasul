// Visões em HTML do processo: linha do tempo, quadro por setor e lista. Mesmos dados, filtros, caminhos e seleção do mapa.
import { el, render } from './dom.js';
import { flowOrder } from '../state/layouts.js';
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
    class: `list-card ${cls}${st.id === c.selectedId ? ' selected' : ''}${match && inPath ? '' : ' dim'}${iss.noOwner ? ' no-owner' : ''}${iss.blocked ? ' blocked' : ''}${c.path && c.ids.has(st.id) ? ' in-path' : ''}${c.route?.via.has(st.id) ? ' via' : ''}${st.kind === 'branch' ? ' branch' : ''}`,
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
    return el('li', { class: `tl-item${st.kind === 'branch' ? ' branch' : ''}`, 'data-sector': st.sector },
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
    return el('section', { class: 'board-col', 'data-sector': sec },
      el('header', {}, el('h3', { text: sec }), el('p', { class: 'muted small', text: `${list.length} etapa${list.length > 1 ? 's' : ''} · ${open} tarefa${open === 1 ? '' : 's'} aberta${open === 1 ? '' : 's'}${late ? ` · ⚠ ${late} atrasada${late > 1 ? 's' : ''}` : ''}${noOwner ? ` · ${noOwner} sem responsável` : ''}` })),
      el('div', { class: 'board-cards' }, list.map((st) => stageCard(c, st, opts.onSelect))));
  })));
}
