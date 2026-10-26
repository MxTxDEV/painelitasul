import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/data/seed.js';
import { computeLayout, depths, MODES, isCanvas } from '../../src/state/layouts.js';

const S = createInitialState();
const CANVAS = MODES.filter((m) => m[2] === 'canvas').map((m) => m[0]);
const overlap = (a, b, n) => !(a.x + n.w <= b.x || b.x + n.w <= a.x || a.y + n.h <= b.y || b.y + n.h <= a.y);

test('modos: 4 em canvas (serpentina, raias, árvore, circular) e 3 em HTML (linha do tempo, quadro por setor, lista)', () => {
  assert.deepEqual(CANVAS, ['mapa', 'raias', 'arvore', 'circulo']);
  assert.deepEqual(MODES.filter((m) => !isCanvas(m[0])).map((m) => m[0]), ['timeline', 'setores', 'lista']);
});

test('camadas: respeitam as ligações (exceto o retorno 11→5)', () => {
  const d = depths(S);
  for (const e of S.edges.filter((x) => !x.loop)) assert.ok(d[e.to] > d[e.from], `${e.from}>${e.to}`);
  assert.equal(d.s1, 0); assert.equal(d.s5 > d.s4, true);
});

for (const mode of CANVAS) {
  test(`layout "${mode}": todas as etapas posicionadas, finitas, sem sobreposição e dentro da área`, () => {
    const L = computeLayout(S, mode), ids = S.stages.map((s) => s.id);
    assert.deepEqual(Object.keys(L.pos).sort(), [...ids].sort());
    for (const id of ids) { const p = L.pos[id]; assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0, id); assert.ok(p.x + L.node.w <= L.size.w && p.y + L.node.h <= L.size.h, `${id} fora da área`); }
    for (const a of ids) for (const b of ids) if (a < b) assert.ok(!overlap(L.pos[a], L.pos[b], L.node), `${a} × ${b} sobrepostos`);
  });
  test(`layout "${mode}": não altera as posições salvas das etapas`, () => {
    const before = JSON.stringify(S.stages.map((s) => [s.x, s.y])); computeLayout(S, mode); assert.equal(JSON.stringify(S.stages.map((s) => [s.x, s.y])), before);
  });
}

test('serpentina usa exatamente as posições gravadas', () => {
  const L = computeLayout(S, 'mapa'); for (const s of S.stages) assert.deepEqual(L.pos[s.id], { x: s.x, y: s.y });
});

test('raias: cada etapa dentro da faixa do seu setor e o fluxo avança da esquerda para a direita', () => {
  const L = computeLayout(S, 'raias'), lanes = Object.fromEntries(L.decor.map((b) => [b.label, b]));
  for (const s of S.stages) { const p = L.pos[s.id], b = lanes[s.sector]; assert.ok(p.y >= b.y && p.y + L.node.h <= b.y + b.h, `${s.id} fora da raia ${s.sector}`); }
  for (const e of S.edges.filter((x) => !x.loop)) assert.ok(L.pos[e.to].x > L.pos[e.from].x, `${e.from}>${e.to}`);
  assert.equal(L.decor.length, new Set(S.stages.map((s) => s.sector)).size);
});

test('árvore: o fluxo desce (cada etapa abaixo das suas predecessoras) e setas longas não atravessam cartões', () => {
  const L = computeLayout(S, 'arvore'), n = L.node;
  for (const e of S.edges.filter((x) => !x.loop)) assert.ok(L.pos[e.to].y > L.pos[e.from].y, `${e.from}>${e.to}`);
  const d = depths(S);
  for (const e of S.edges.filter((x) => !x.loop && d[x.to] - d[x.from] >= 2)) for (const s of S.stages) if (d[s.id] > d[e.from] && d[s.id] < d[e.to]) {
    const a = L.pos[e.from], b = L.pos[e.to], r = L.pos[s.id];
    for (let k = 1; k < 24; k++) { const px = a.x + (b.x - a.x) * k / 24 + n.w / 2, py = a.y + (b.y - a.y) * k / 24 + n.h / 2; assert.ok(!(px > r.x && px < r.x + n.w && py > r.y && py < r.y + n.h), `${e.from}>${e.to} cruza ${s.id}`); }
  }
});

test('circular: todas as etapas equidistantes do centro e em ordem de fluxo', () => {
  const L = computeLayout(S, 'circulo'), { x: cx, y: cy, r } = L.center;
  for (const s of S.stages) { const p = L.pos[s.id]; assert.ok(Math.abs(Math.hypot(p.x + L.node.w / 2 - cx, p.y + L.node.h / 2 - cy) - r) < 1, s.id); }
  const first = S.stages.find((s) => s.id === 's1'), p = L.pos.s1; assert.ok(p.y < cy, 'a etapa 1 começa no topo');
});

test('etapa criada pelo usuário e sem ligações entra em todos os layouts sem sobrepor', () => {
  const st = createInitialState(); st.stages.push({ ...st.stages[0], id: 's_meu', name: 'Minha etapa', num: null, sector: 'Setor Novo', x: 40, y: 1200 });
  for (const mode of CANVAS) { const L = computeLayout(st, mode); assert.ok(L.pos.s_meu, mode); const ids = Object.keys(L.pos); for (const a of ids) for (const b of ids) if (a < b) assert.ok(!overlap(L.pos[a], L.pos[b], L.node), `${mode}: ${a} × ${b}`); }
});
