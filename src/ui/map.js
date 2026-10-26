// Mapa operacional: nós HTML + arestas SVG dentro de um canvas com pan/zoom.
import { el, clear } from './dom.js';
import { computeLayout, depths } from '../state/layouts.js';
import { sectorClass, sectorSlug } from './sectors.js';
import { byId, personName, stageIssues, stageMatches, isHandoff, stageWaiting, edgeWaiting, pathRoute, downstream } from '../state/logic.js';

const view = { x: 20, y: 10, k: 0.8 };
let fitted = false, lastMode = null;

// Pontos de ligação entre dois cartões (a, b = cantos superiores esquerdos; n = tamanho do cartão).
function anchor(a, b, n) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dy) < 20 || Math.abs(dx) > Math.abs(dy) * 1.2) {
    return dx > 0
      ? { s: [a.x + n.w, a.y + n.h / 2], t: [b.x, b.y + n.h / 2], h: true }
      : { s: [a.x, a.y + n.h / 2], t: [b.x + n.w, b.y + n.h / 2], h: true };
  }
  return dy > 0
    ? { s: [a.x + n.w / 2, a.y + n.h], t: [b.x + n.w / 2, b.y] }
    : { s: [a.x + n.w / 2, a.y], t: [b.x + n.w / 2, b.y + n.h] };
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

// Fundo neural decorativo (determinístico): pontos ligados aos vizinhos por curvas finas; cada ponto "pisca" em tempo próprio.
function synapses(w, h) {
  let seed = 17; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const n = Math.max(26, Math.min(80, Math.round((w * h) / 42000))), pts = Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h }));
  const svg = svgEl('svg', { class: 'synapses', width: w, height: h, 'aria-hidden': 'true' });
  pts.forEach((a, i) => {
    pts.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) })).filter((o) => o.j !== i).sort((p, q) => p.d - q.d).slice(0, 2).forEach(({ j }) => {
      if (j < i) return; const b = pts[j], mx = (a.x + b.x) / 2 + (rnd() - .5) * 90, my = (a.y + b.y) / 2 + (rnd() - .5) * 90;
      svg.append(svgEl('path', { class: 'syn-line', d: `M${a.x.toFixed(0)},${a.y.toFixed(0)} Q${mx.toFixed(0)},${my.toFixed(0)} ${b.x.toFixed(0)},${b.y.toFixed(0)}` }));
    });
    svg.append(svgEl('circle', { class: 'syn-dot', cx: a.x.toFixed(0), cy: a.y.toFixed(0), r: (1.6 + rnd() * 2.2).toFixed(1), style: `--sd:${(rnd() * 5).toFixed(2)}s` }));
  });
  return svg;
}

export function renderMap(host, { state, filters, selectedId, pathId, onSelect, mode = 'mapa', anim = false }) {
  const focusId = host.contains(document.activeElement) ? document.activeElement.dataset?.stage : null;
  clear(host);
  const path = state.paths.find((p) => p.id === pathId) || null;
  const pathIds = new Set(path?.steps.map((s) => s.stageId).filter(Boolean));
  const route = path ? pathRoute(state, path) : null;
  const stepNums = {};
  path?.steps.forEach((s, i) => { if (s.stageId) (stepNums[s.stageId] ||= []).push(i + 1); });

  const L = computeLayout(state, mode), N = L.node, P = (st) => L.pos[st.id];
  const maxX = L.size.w, maxY = L.size.h;
  if (mode !== lastMode) { fitted = false; lastMode = mode; }   // trocou a forma do mapa: reenquadra

  const svg = svgEl('svg', { class: 'edges', width: maxX, height: maxY, 'aria-hidden': 'true' });
  const defs = svgEl('defs');
  for (const [id, cls] of [['arrow', 'a-norm'], ['arrow-hl', 'a-hl']]) {
    const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
    m.append(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: cls })); defs.append(m);
  }
  const slugs = [...new Set(state.stages.map((x) => x.sector))];
  if (anim) for (const sec of slugs) {   // seta na cor do setor de origem
    const m = svgEl('marker', { id: `arrow-s-${sectorSlug(sec)}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
    m.append(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', class: `a-sec ${sectorClass(sec)}` })); defs.append(m);
  }
  svg.append(defs);
  const dep = depths(state), cas = anim && selectedId ? downstream(state, selectedId) : null;
  const pulses = [];
  for (const e of state.edges) {
    const a = byId(state.stages, e.from), b = byId(state.stages, e.to);
    if (!a || !b) continue;
    const g = anchor(P(a), P(b), N);
    const hl = Boolean(route?.edges.has(`${a.id}>${b.id}`));
    const handoff = isHandoff(state, e);
    const dim = (path && !hl) || (!path && false);
    const p = svgEl('path', { d: edgePath(g), class: `edge ${sectorClass(a.sector)}${hl ? ' hl' : ''}${edgeWaiting(state, e) ? ' wait' : ''}${dim ? ' dim' : ''}${a.kind === 'branch' || b.kind === 'branch' ? ' branch' : ''}`, 'marker-end': `url(#${hl ? 'arrow-hl' : anim ? `arrow-s-${sectorSlug(a.sector)}` : 'arrow'})`, 'data-from': a.id, 'data-to': b.id });
    svg.append(p);
    if (anim && !dim) {      // sinal que sai do neurônio de origem quando ele dispara (e, com um caminho escolhido, também em cascata)
      const begin = (dep[a.id] * .55 + .2).toFixed(2), dur = 7;
      const add = (cls, bg, d2, rep) => { const c = svgEl('circle', { class: `pulse ${cls} ${sectorClass(a.sector)}`, r: hl ? 7 : 5.5, opacity: 0 });
        c.append(svgEl('animateMotion', { path: p.getAttribute('d'), dur: `${d2}s`, begin: `${bg}s`, repeatCount: rep, keyPoints: d2 > 2 ? '0;1;1' : '0;1', keyTimes: d2 > 2 ? '0;.13;1' : '0;1', calcMode: 'linear' }));
        c.append(svgEl('animate', { attributeName: 'opacity', values: d2 > 2 ? '0;1;1;0;0' : '0;1;1;0', keyTimes: d2 > 2 ? '0;.01;.12;.15;1' : '0;.1;.85;1', dur: `${d2}s`, begin: `${bg}s`, repeatCount: rep })); pulses.push(c); };
      add('', begin, dur, 'indefinite');
      if (cas && a.id in cas) add('strong', (cas[a.id] * .38 + .1).toFixed(2), 1.1, '2');
    }
    if (handoff) {
      const mx = (g.s[0] + g.t[0]) / 2, my = (g.s[1] + g.t[1]) / 2;
      const c = svgEl('circle', { cx: mx, cy: my, r: 6, class: `handoff${dim ? ' dim' : ''}` });
      const t = svgEl('title'); t.textContent = `Transferência de responsabilidade: ${a.sector} → ${b.sector}`;
      c.append(t); svg.append(c);
    }
  }

  pulses.forEach((c) => svg.append(c));   // pulsos por cima das ligações
  const canvas = el('div', { class: `canvas${anim ? ' brain' : ''}`, 'data-mode': mode, style: `width:${maxX}px;height:${maxY}px` },
    anim ? synapses(maxX, maxY) : null,
    L.decor.map((b) => el('div', { class: b.cls + (b.sector ? ` ${sectorClass(b.sector)}` : ''), 'aria-hidden': 'true', style: `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px` }, el('span', { class: `${b.cls}-label`, text: b.label }))), svg);
  for (const s of state.stages) {
    const iss = stageIssues(state, s);
    const waiting = stageWaiting(state, s.id);
    const match = stageMatches(state, s, filters);
    const inPath = !path || pathIds.has(s.id) || route.via.has(s.id);
    const node = el('button', {
      type: 'button', 'data-stage': s.id, 'data-testid': `node-${s.id}`,
      class: `node ${s.kind} ${sectorClass(s.sector)}${cas && s.id in cas ? ' cascade' : ''}${N.compact ? ' compact' : ''}${s.id === selectedId ? ' selected' : ''}${match && inPath ? '' : ' dim'}${path && pathIds.has(s.id) ? ' in-path' : ''}${iss.noOwner ? ' no-owner' : ''}${iss.blocked ? ' blocked' : ''}${waiting.length ? ' waiting' : ''}${route?.via.has(s.id) ? ' via' : ''}`,
      style: `left:${P(s).x}px;top:${P(s).y}px;width:${N.w}px;height:${N.h}px;--nd:${dep[s.id]};--cd:${cas?.[s.id] ?? 0}`,
      'aria-label': `${s.num ? `Etapa ${s.num}: ` : 'Ramal: '}${s.name}`,
      onClick: (ev) => { ev.stopPropagation(); onSelect(s.id); },
    },
      el('span', { class: 'node-top' },
        el('span', { class: 'badge-num', text: s.num ?? 'R' }),
        el('span', { class: 'chip sec', text: s.sector }),
        route?.via.has(s.id) && el('span', { class: 'chip', title: 'O caminho passa por esta etapa', text: N.compact ? 'via' : 'passa por aqui' }),
        s.kind === 'branch' && el('span', { class: 'chip', text: 'Ramal' }),
        stepNums[s.id] && el('span', { class: 'step-badge', title: 'Posição no caminho selecionado', text: `#${stepNums[s.id].join(',')}` })),
      el('span', { class: 'node-name', text: s.name }),
      el('span', { class: 'node-foot' },
        el('span', { class: `owner${iss.noOwner ? ' undefined' : ''}`, text: iss.noOwner ? '⚠ Responsável: A definir' : personName(state, s.ownerId) }),
        waiting.length > 0 && el('span', { class: 'alert wait', title: `Aguardando conclusão de: ${waiting.map((w) => w.from.name).join(', ')}`, text: `⏳ aguarda ${waiting.length}` }),
        iss.open > 0 && el('span', { class: 'alert open', title: 'Tarefas abertas', text: `${iss.open} aberta${iss.open > 1 ? 's' : ''}` }),
        iss.overdue > 0 && el('span', { class: 'alert late', title: 'Tarefas atrasadas', text: `⚠ ${iss.overdue} atrasada${iss.overdue > 1 ? 's' : ''}` }),
        iss.blocked > 0 && el('span', { class: 'alert block', title: 'Tarefas bloqueadas', text: `⛔ ${iss.blocked} bloq.` })));
    canvas.append(node);
  }
  host.append(canvas);
  // passar o mouse/foco em um cartão acende só as ligações dele (sinapses ativas)
  const light = (id, on) => { canvas.classList.toggle('focusing', on); canvas.querySelectorAll('.edge').forEach((e) => e.classList.toggle('on', on && (e.dataset.from === id || e.dataset.to === id))); };
  canvas.querySelectorAll('.node').forEach((n) => { const id = n.dataset.stage; n.addEventListener('pointerenter', () => light(id, true)); n.addEventListener('pointerleave', () => light(id, false)); n.addEventListener('focus', () => light(id, true)); n.addEventListener('blur', () => light(id, false)); });

  const apply = () => { canvas.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; };
  const ensureVisible = (st) => {
    const r = host.getBoundingClientRect(), pad = 24;
    const l = view.x + P(st).x * view.k, t = view.y + P(st).y * view.k, rr = l + N.w * view.k, b = t + N.h * view.k;
    if (l < pad) view.x += pad - l; else if (rr > r.width - pad) view.x -= rr - (r.width - pad);
    if (t < pad) view.y += pad - t; else if (b > r.height - pad) view.y -= b - (r.height - pad);
    apply();
  };
  const selSt = byId(state.stages, selectedId);
  // all=true: enquadra o mapa inteiro (botão "Ajustar"). Sem all e com etapa selecionada (painel aberto, mapa estreito):
  // mantém o zoom legível (≥ 78%) e centraliza a etapa selecionada. Sem seleção: enquadra tudo sem passar de 60% para baixo.
  const fit = (all = false) => {
    const r = host.getBoundingClientRect();
    const whole = L.fit === 'tall' ? Math.min(r.width / maxX, Math.max(r.height / maxY, 0.62)) : Math.min(r.width / maxX, r.height / maxY);   // 'tall' (árvore): prioriza a leitura e deixa rolar na vertical
    const minK = mode === 'mapa' ? 0.6 : L.fit === 'tall' ? 0.62 : 0.42;
    if (selSt && !all) {
      view.k = Math.min(1, Math.max(whole, 0.78));
      view.x = r.width / 2 - (P(selSt).x + N.w / 2) * view.k; view.y = r.height / 2 - (P(selSt).y + N.h / 2) * view.k;
    } else {
      view.k = Math.min(1, Math.max(all ? 0.25 : minK, whole));
      view.x = Math.max(8, (r.width - maxX * view.k) / 2); view.y = 8;
    }
    apply();
  };
  if (!fitted) { fit(); fitted = true; } else apply();
  host.__fit = fit;

  const zoomAt = (factor, cx, cy) => {
    const k = Math.min(2, Math.max(0.25, view.k * factor)), f = k / view.k;
    view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.k = k; apply();
  };
  host.__zoom = (f) => { const r = host.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); };

  // Navegação por teclado: setas movem o foco para o cartão mais próximo naquela direção.
  canvas.addEventListener('keydown', (ev) => {
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[ev.key];
    const cur = byId(state.stages, ev.target.dataset?.stage);
    if (!dir || !cur) return;
    let best = null, bestScore = Infinity;
    for (const c of state.stages) {
      const dx = P(c).x - P(cur).x, dy = P(c).y - P(cur).y, along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      if (c === cur || along <= 0) continue;
      const score = along + across * 2;
      if (score < bestScore) { best = c; bestScore = score; }
    }
    if (best) { ev.preventDefault(); canvas.querySelector(`[data-stage="${best.id}"]`)?.focus({ preventScroll: true }); ensureVisible(best); }
  });
  canvas.addEventListener('focusin', (ev) => { const st = byId(state.stages, ev.target.dataset?.stage); if (st) ensureVisible(st); });
  if (focusId) canvas.querySelector(`[data-stage="${focusId}"]`)?.focus({ preventScroll: true });

  host.onwheel = (ev) => { ev.preventDefault(); const r = host.getBoundingClientRect(); zoomAt(ev.deltaY < 0 ? 1.1 : 0.9, ev.clientX - r.left, ev.clientY - r.top); };
  let drag = null;
  host.onpointerdown = (ev) => {
    if (ev.target.closest('.node')) return;
    host.__moved = false;
    drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y }; host.setPointerCapture(ev.pointerId); host.classList.add('grabbing');
  };
  host.onpointermove = (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) host.__moved = true; // arrastar não conta como clique (não fecha o painel)
    view.x = drag.vx + dx; view.y = drag.vy + dy; apply();
  };
  host.onpointerup = host.onpointercancel = () => { drag = null; host.classList.remove('grabbing'); };
}

export const mapControls = (host) => ({
  zoomIn: () => host.__zoom?.(1.2), zoomOut: () => host.__zoom?.(1 / 1.2), fit: () => host.__fit?.(true),
});
export const getView = () => ({ ...view });
