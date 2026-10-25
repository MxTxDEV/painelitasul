// Mapa operacional: nós HTML + arestas SVG dentro de um canvas com pan/zoom.
import { el, clear } from './dom.js';
import { byId, personName, stageIssues, stageMatches, isHandoff, stageWaiting, stageProgress } from '../state/logic.js';

const NODE_W = 260, NODE_H = 140;
const view = { x: 20, y: 10, k: 0.8 };
let fitted = false;

function anchor(a, b) {
  const dy = b.y - a.y;
  if (Math.abs(dy) < 20) {
    return b.x > a.x
      ? { s: [a.x + NODE_W, a.y + NODE_H / 2], t: [b.x, b.y + NODE_H / 2], h: true }
      : { s: [a.x, a.y + NODE_H / 2], t: [b.x + NODE_W, b.y + NODE_H / 2], h: true };
  }
  return dy > 0
    ? { s: [a.x + NODE_W / 2, a.y + NODE_H], t: [b.x + NODE_W / 2, b.y] }
    : { s: [a.x + NODE_W / 2, a.y], t: [b.x + NODE_W / 2, b.y + NODE_H] };
}

function edgePath({ s, t, h }) {
  if (h) { const d = Math.max(40, Math.abs(t[0] - s[0]) / 2); const dir = t[0] > s[0] ? 1 : -1; return `M${s} C${s[0] + dir * d},${s[1]} ${t[0] - dir * d},${t[1]} ${t}`; }
  const my = (s[1] + t[1]) / 2;
  return `M${s} C${s[0]},${my} ${t[0]},${my} ${t}`;
}

const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

export function renderMap(host, { state, filters, selectedId, pathId, onSelect }) {
  clear(host);
  const path = state.paths.find((p) => p.id === pathId) || null;
  const pathIds = new Set(path?.steps.map((s) => s.stageId).filter(Boolean));
  const stepNums = {};
  path?.steps.forEach((s, i) => { if (s.stageId) (stepNums[s.stageId] ||= []).push(i + 1); });

  const maxX = Math.max(...state.stages.map((s) => s.x)) + NODE_W + 60;
  const maxY = Math.max(...state.stages.map((s) => s.y)) + NODE_H + 60;

  const svg = svgEl('svg', { class: 'edges', width: maxX, height: maxY, 'aria-hidden': 'true' });
  const defs = svgEl('defs');
  for (const [id, cls] of [['arrow', 'a-norm'], ['arrow-hl', 'a-hl']]) {
    const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
    m.append(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: cls })); defs.append(m);
  }
  svg.append(defs);
  for (const e of state.edges) {
    const a = byId(state.stages, e.from), b = byId(state.stages, e.to);
    if (!a || !b) continue;
    const g = anchor(a, b);
    const hl = path && pathIds.has(a.id) && pathIds.has(b.id);
    const handoff = isHandoff(state, e);
    const dim = (path && !hl) || (!path && false);
    const p = svgEl('path', { d: edgePath(g), class: `edge${hl ? ' hl' : ''}${a.kind !== 'branch' && stageProgress(state, a.id).state === 'em-aberto' ? ' wait' : ''}${dim ? ' dim' : ''}${a.kind === 'branch' || b.kind === 'branch' ? ' branch' : ''}`, 'marker-end': `url(#${hl ? 'arrow-hl' : 'arrow'})` });
    svg.append(p);
    if (handoff) {
      const mx = (g.s[0] + g.t[0]) / 2, my = (g.s[1] + g.t[1]) / 2;
      const c = svgEl('circle', { cx: mx, cy: my, r: 6, class: `handoff${dim ? ' dim' : ''}` });
      const t = svgEl('title'); t.textContent = `Transferência de responsabilidade: ${a.sector} → ${b.sector}`;
      c.append(t); svg.append(c);
    }
  }

  const canvas = el('div', { class: 'canvas', style: `width:${maxX}px;height:${maxY}px` }, svg);
  for (const s of state.stages) {
    const iss = stageIssues(state, s);
    const waiting = stageWaiting(state, s.id);
    const match = stageMatches(state, s, filters);
    const inPath = !path || pathIds.has(s.id);
    const node = el('button', {
      type: 'button', 'data-stage': s.id, 'data-testid': `node-${s.id}`,
      class: `node ${s.kind}${s.id === selectedId ? ' selected' : ''}${match && inPath ? '' : ' dim'}${path && pathIds.has(s.id) ? ' in-path' : ''}${iss.noOwner ? ' no-owner' : ''}${waiting.length ? ' waiting' : ''}`,
      style: `left:${s.x}px;top:${s.y}px;width:${NODE_W}px;height:${NODE_H}px`,
      'aria-label': `${s.num ? `Etapa ${s.num}: ` : 'Ramal: '}${s.name}`,
      onClick: (ev) => { ev.stopPropagation(); onSelect(s.id); },
    },
      el('span', { class: 'node-top' },
        el('span', { class: 'badge-num', text: s.num ?? 'R' }),
        el('span', { class: 'chip', text: s.sector }),
        stepNums[s.id] && el('span', { class: 'step-badge', title: 'Posição no caminho selecionado', text: `#${stepNums[s.id].join(',')}` })),
      el('span', { class: 'node-name', text: s.name }),
      el('span', { class: 'node-foot' },
        el('span', { class: `owner${iss.noOwner ? ' undefined' : ''}`, text: iss.noOwner ? '⚠ Responsável: A definir' : personName(state, s.ownerId) }),
        waiting.length > 0 && el('span', { class: 'alert wait', title: `Aguardando conclusão de: ${waiting.map((w) => w.from.name).join(', ')}`, text: `⏳ aguarda ${waiting.length}` }),
        iss.open > 0 && el('span', { class: 'alert open', title: 'Tarefas abertas', text: `${iss.open} aberta${iss.open > 1 ? 's' : ''}` }),
        iss.overdue > 0 && el('span', { class: 'alert late', title: 'Tarefas atrasadas', text: `${iss.overdue} atrasada${iss.overdue > 1 ? 's' : ''}` }),
        iss.blocked > 0 && el('span', { class: 'alert block', title: 'Tarefas bloqueadas', text: `${iss.blocked} bloq.` })));
    canvas.append(node);
  }
  host.append(canvas);

  const apply = () => { canvas.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; };
  const fit = () => {
    const r = host.getBoundingClientRect();
    view.k = Math.min(1, Math.max(0.3, Math.min(r.width / maxX, r.height / maxY)));
    view.x = (r.width - maxX * view.k) / 2; view.y = 8; apply();
  };
  if (!fitted) { fit(); fitted = true; } else apply();
  host.__fit = fit;

  const zoomAt = (factor, cx, cy) => {
    const k = Math.min(2, Math.max(0.25, view.k * factor)), f = k / view.k;
    view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.k = k; apply();
  };
  host.__zoom = (f) => { const r = host.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); };

  host.onwheel = (ev) => { ev.preventDefault(); const r = host.getBoundingClientRect(); zoomAt(ev.deltaY < 0 ? 1.1 : 0.9, ev.clientX - r.left, ev.clientY - r.top); };
  let drag = null;
  host.onpointerdown = (ev) => { if (ev.target.closest('.node')) return; drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y }; host.setPointerCapture(ev.pointerId); host.classList.add('grabbing'); };
  host.onpointermove = (ev) => { if (!drag) return; view.x = drag.vx + ev.clientX - drag.x; view.y = drag.vy + ev.clientY - drag.y; apply(); };
  host.onpointerup = host.onpointercancel = () => { drag = null; host.classList.remove('grabbing'); };
}

export const mapControls = (host) => ({
  zoomIn: () => host.__zoom?.(1.2), zoomOut: () => host.__zoom?.(1 / 1.2), fit: () => host.__fit?.(),
});
export const getView = () => ({ ...view });
