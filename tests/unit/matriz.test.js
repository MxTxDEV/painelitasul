import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/data/seed.js';
import { sectorMatrix, MODES, isCanvas } from '../../src/state/layouts.js';
import { downstream } from '../../src/state/logic.js';
import { sectorSlug, sectorClass, KNOWN_SECTORS } from '../../src/ui/sectors.js';

const S = createInitialState();

test('matriz: 7 setores × 13 etapas e a nova forma é uma visão em HTML', () => {
  const m = sectorMatrix(S);
  assert.equal(m.rows.length, 7); assert.equal(m.cols.length, 13); assert.equal(Object.keys(m.cells).length, 7 * 13);
  assert.ok(MODES.some(([id, , kind]) => id === 'matriz' && kind === 'html')); assert.equal(isCanvas('matriz'), false);
});

test('matriz: cada etapa é "executada" por exatamente um setor — o dela', () => {
  const m = sectorMatrix(S);
  for (const st of m.cols) {
    const donos = m.rows.filter((r) => m.cells[`${r}|${st.id}`].roles.includes('executa'));
    assert.deepEqual(donos, [st.sector], st.id);
  }
});

test('matriz: entrega/recebe batem com as ligações que mudam de setor (inclusive o retorno 11→5)', () => {
  const m = sectorMatrix(S), byId = Object.fromEntries(S.stages.map((s) => [s.id, s]));
  const cross = S.edges.filter((e) => byId[e.from].sector !== byId[e.to].sector);
  let entregas = 0, recebes = 0;
  for (const c of Object.values(m.cells)) { entregas += c.deliversTo.length; recebes += c.receivesFrom.length; }
  assert.equal(entregas, cross.length); assert.equal(recebes, cross.length);
  const c = m.cells['Comercial|s3'];            // etapa 3 (Atendimento) entrega ao Comercial
  assert.deepEqual(c.roles, ['entrega']); assert.deepEqual(c.deliversTo.map((x) => x.id).sort(), ['b_munck', 's4']);
  const r = m.cells['Atendimento|s4'];           // etapa 4 (Comercial) recebe de Atendimento (s3)
  assert.ok(r.roles.includes('recebe') && r.receivesFrom.some((x) => x.id === 's3'));
  assert.ok(m.cells['Operação|s11'].deliversTo.some((x) => x.loop), 'retorno marcado como loop');
  assert.deepEqual(m.cells['Marketing|s7'].roles, [], 'célula sem relação fica vazia');
});

test('matriz: setor criado pelo usuário ganha linha própria', () => {
  const st = createInitialState(); st.stages.push({ ...st.stages[0], id: 's_n', name: 'N', num: null, sector: 'Setor Novo' });
  const m = sectorMatrix(st); assert.ok(m.rows.includes('Setor Novo')); assert.deepEqual(m.cells['Setor Novo|s_n'].roles, ['executa']);
});

test('cascata: distâncias a jusante a partir de uma etapa (sem retorno)', () => {
  const d = downstream(S, 's4');
  assert.equal(d.s4, 0); assert.equal(d.s5, 1); assert.equal(d.s6, 2); assert.equal(d.s7, 3); assert.equal(d.s8, 4); assert.equal(d.s9, 4);
  assert.ok(!('s1' in d) && !('s3' in d), 'não propaga para trás'); assert.equal(d.s11, 5);
  assert.ok(d.s5 === 1, 'o retorno 11→5 não reduz a distância');
  assert.deepEqual(Object.keys(downstream(S, 's10')), ['s10']);
});

test('setores: cada setor padrão tem classe/cor própria e setores novos recebem cor estável', () => {
  const slugs = KNOWN_SECTORS.map(sectorSlug); assert.equal(new Set(slugs).size, 7);
  assert.equal(sectorClass('Operação'), 'sec-operacao'); assert.equal(sectorClass('Pós-venda'), 'sec-posvenda');
  assert.equal(sectorClass('Jurídico'), sectorClass('Jurídico')); assert.match(sectorClass('Jurídico'), /^sec-x[0-5]$/);
});
