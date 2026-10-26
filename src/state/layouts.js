// Formas alternativas de desenhar o mapa. Funções PURAS: calculam posições a partir das etapas e ligações,
// sem alterar os dados salvos (a serpentina continua usando as posições gravadas de cada etapa).
import { NODE_W, NODE_H, SECTORS } from '../data/seed.js';

export const MODES = [
  ['mapa', 'Serpentina', 'canvas'], ['raias', 'Raias por setor', 'canvas'], ['arvore', 'Árvore', 'canvas'], ['circulo', 'Circular', 'canvas'],
  ['timeline', 'Linha do tempo', 'html'], ['setores', 'Quadro por setor', 'html'], ['lista', 'Lista', 'html'],
];
export const isCanvas = (m) => MODES.find((x) => x[0] === m)?.[2] === 'canvas';
export const isMode = (m) => MODES.some((x) => x[0] === m);

export const MINI = { w: 232, h: 132 };           // cartão compacto das formas alternativas
const MARGIN = 40;

// Camadas = maior caminho a partir do início, ignorando retornos (loop). Etapas sem ligações ficam na camada 0.
export function depths(state) {
  const d = Object.fromEntries(state.stages.map((s) => [s.id, 0]));
  const edges = state.edges.filter((e) => !e.loop && e.from in d && e.to in d && e.from !== e.to);
  for (let i = 0; i <= state.stages.length; i++) {
    let changed = false;
    for (const e of edges) if (d[e.to] < d[e.from] + 1) { d[e.to] = d[e.from] + 1; changed = true; }
    if (!changed) break;
  }
  return d;
}

const finish = (mode, node, pos, decor = [], extra = {}) => {
  const ids = Object.keys(pos);
  const w = Math.max(...ids.map((i) => pos[i].x + node.w), ...decor.map((b) => b.x + b.w)) + MARGIN;
  const h = Math.max(...ids.map((i) => pos[i].y + node.h), ...decor.map((b) => b.y + b.h)) + MARGIN;
  return { mode, node, pos, decor, size: { w, h }, fit: 'all', ...extra };
};

function serpentina(state) {
  const pos = Object.fromEntries(state.stages.map((s) => [s.id, { x: s.x, y: s.y }]));
  return { mode: 'mapa', node: { w: NODE_W, h: NODE_H, compact: false }, pos, decor: [], size: { w: Math.max(...state.stages.map((s) => s.x)) + NODE_W + MARGIN, h: Math.max(...state.stages.map((s) => s.y)) + NODE_H + MARGIN }, fit: 'all' };
}

function raias(state) {
  const node = { ...MINI, compact: true }, d = depths(state), gutter = 170, gapX = 40, gapY = 18, pad = 22;
  const lanes = [...SECTORS.filter((s) => state.stages.some((x) => x.sector === s)), ...new Set(state.stages.map((s) => s.sector).filter((s) => !SECTORS.includes(s)))];
  const cell = {}, stack = {};
  for (const s of state.stages) { const k = `${s.sector}|${d[s.id]}`; stack[s.id] = cell[k] = (cell[k] ?? -1) + 1; }
  const laneRows = Object.fromEntries(lanes.map((l) => [l, Math.max(1, ...state.stages.filter((s) => s.sector === l).map((s) => stack[s.id] + 1))]));
  let y = 0; const top = {}, decor = [];
  for (const l of lanes) { top[l] = y; const h = laneRows[l] * node.h + (laneRows[l] - 1) * gapY + 2 * pad; decor.push({ cls: 'lane', label: l, x: 0, y, w: 0, h }); y += h + 12; }
  const pos = {};
  for (const s of state.stages) pos[s.id] = { x: gutter + d[s.id] * (node.w + gapX), y: top[s.sector] + pad + stack[s.id] * (node.h + gapY) };
  const width = Math.max(...Object.values(pos).map((p) => p.x)) + node.w + MARGIN / 2;
  decor.forEach((b) => { b.w = width; });
  return finish('raias', node, pos, decor);
}

function arvore(state) {
  const node = { ...MINI, compact: true }, d = depths(state), gapX = 56, gapY = 44;
  const rows = []; state.stages.forEach((s) => (rows[d[s.id]] ||= []).push(s));
  const parentsX = (s, pos) => { const ps = state.edges.filter((e) => e.to === s.id && !e.loop && pos[e.from]).map((e) => pos[e.from].x); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null; };
  const pos = {}; const widest = Math.max(...rows.filter(Boolean).map((r) => r.length));
  const cx = (widest * (node.w + gapX) - gapX) / 2 + MARGIN;
  rows.forEach((row, depth) => {
    if (!row) return;
    const ordered = [...row].map((s, i) => ({ s, i, px: parentsX(s, pos) })).sort((a, b) => (a.px ?? cx) - (b.px ?? cx) || a.i - b.i).map((o) => o.s);
    const total = ordered.length * node.w + (ordered.length - 1) * gapX; let x = cx - total / 2;
    ordered.forEach((s) => { pos[s.id] = { x, y: MARGIN + depth * (node.h + gapY) }; x += node.w + gapX; });
  });
  // setas que pulam camadas não podem atravessar cartões intermediários: desloca o cartão no caminho
  const hits = (a, b, n) => { for (let k = 1; k < 24; k++) { const px = a.x + (b.x - a.x) * k / 24 + node.w / 2, py = a.y + (b.y - a.y) * k / 24 + node.h / 2; if (px > n.x - 6 && px < n.x + node.w + 6 && py > n.y - 6 && py < n.y + node.h + 6) return true; } return false; };
  for (let pass = 0; pass < 4; pass++) {
    for (const e of state.edges) {
      if (e.loop || !pos[e.from] || !pos[e.to] || d[e.to] - d[e.from] < 2) continue;
      for (const s of state.stages) if (d[s.id] > d[e.from] && d[s.id] < d[e.to] && hits(pos[e.from], pos[e.to], pos[s.id])) pos[s.id].x += node.w / 2 + gapX / 2 + 20;
    }
  }
  const minX = Math.min(...Object.values(pos).map((p) => p.x)); Object.values(pos).forEach((p) => { p.x += MARGIN - minX; });
  return finish('arvore', node, pos, [], { fit: 'tall' });
}

function circulo(state) {
  const node = { ...MINI, compact: true }, d = depths(state);
  const order = [...state.stages].map((s, i) => ({ s, i })).sort((a, b) => d[a.s.id] - d[b.s.id] || a.i - b.i).map((o) => o.s);
  const n = order.length, gap = Math.hypot(node.w, node.h) + 14;   // distância mínima entre centros vizinhos: diagonal do cartão
  const R = Math.max(330, gap / (2 * Math.sin(Math.PI / Math.max(n, 3))));
  const c = R + node.w / 2 + MARGIN + 20, pos = {};
  order.forEach((s, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; pos[s.id] = { x: c + R * Math.cos(a) - node.w / 2, y: c + R * Math.sin(a) - node.h / 2 }; });
  const ri = R - node.h / 2 - 28;                                   // anel guia por dentro dos cartões (não coincide com as setas)
  const ring = { cls: 'ring', label: 'Fluxo de locação', x: c - ri, y: c - ri, w: 2 * ri, h: 2 * ri };
  return finish('circulo', node, pos, [ring], { center: { x: c, y: c, r: R } });
}

export function computeLayout(state, mode) {
  switch (mode) { case 'raias': return raias(state); case 'arvore': return arvore(state); case 'circulo': return circulo(state); default: return serpentina(state); }
}

// Ordem de leitura do fluxo: por camada e, em empate, pela ordem de cadastro.
export function flowOrder(state) {
  const d = depths(state);
  return state.stages.map((s, i) => ({ s, i })).sort((a, b) => d[a.s.id] - d[b.s.id] || a.i - b.i).map((o) => o.s);
}
