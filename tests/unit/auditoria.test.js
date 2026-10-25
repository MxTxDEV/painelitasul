// Testes da auditoria funcional: cada um nasceu de um defeito (ou risco) verificado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY } from '../../src/state/store.js';
import { stageMatches, EMPTY_FILTERS, stageWaiting, dependencies, handoffList, pathRoute, computeIndicators } from '../../src/state/logic.js';
import { createInitialState } from '../../src/data/seed.js';

const fresh = () => createStore({ storage: { getItem: () => null, setItem() {} } });
const f = (o) => ({ ...EMPTY_FILTERS, ...o });
const match = (s, o) => s.stages.filter((x) => stageMatches(s, x, f(o))).map((x) => x.id);

test('filtro responsável + status exige que a MESMA tarefa case (antes casava tarefas de outras pessoas)', () => {
  const st = fresh();
  const a = st.addEmployee({ name: 'A' }), b = st.addEmployee({ name: 'B' });
  st.updateStage('s4', { ownerId: a.id });
  st.addTask({ stageId: 's4', title: 'da B', ownerId: b.id, status: 'Bloqueada' });
  st.addTask({ stageId: 's4', title: 'da A', ownerId: a.id, status: 'Pendente' });
  const s = st.get();
  assert.deepEqual(match(s, { person: a.id, status: 'Bloqueada' }), [], 'A não tem tarefa bloqueada');
  assert.deepEqual(match(s, { person: b.id, status: 'Bloqueada' }), ['s4']);
  assert.deepEqual(match(s, { person: a.id, status: 'Pendente' }), ['s4']);
  assert.deepEqual(match(s, { person: '__none', status: 'Pendente' }), [], 'todas as tarefas têm dono');
  assert.deepEqual(match(s, { person: a.id }), ['s4'], 'só responsável: continua casando pela etapa');
});

test('retorno da manutenção (11→5) não bloqueia a etapa 5 de forma indevida', () => {
  const st = fresh();
  st.addTask({ stageId: 's11', title: 'Reparo em andamento' });
  assert.deepEqual(stageWaiting(st.get(), 's5').map((d) => d.from.id), [], 'só s4 → s5 é dependência bloqueante');
  const dep = dependencies(st.get(), 's5').find((d) => d.from.id === 's11');
  assert.equal(dep.loop, true); assert.equal(dep.waiting, false);
  assert.ok(!handoffList(st.get()).find((h) => h.from.id === 's11')?.waiting);
});

test('etapa já concluída não é marcada como bloqueada; ramais não bloqueiam nem são bloqueados', () => {
  const st = fresh();
  const t4 = st.addTask({ stageId: 's4', title: 'x' }); st.completeTask(t4.id);
  st.addTask({ stageId: 's3', title: 'y' });
  assert.deepEqual(stageWaiting(st.get(), 's4'), [], 's4 concluída');
  assert.deepEqual(stageWaiting(st.get(), 'b_munck'), [], 'ramal não é bloqueado');
  st.addTask({ stageId: 'b_munck', title: 'z' });
  assert.deepEqual(stageWaiting(st.get(), 's4'), [], 'e segue concluída');
  const st2 = fresh(); st2.addTask({ stageId: 's3', title: 'y' }); st2.addTask({ stageId: 's4', title: 'aberta' });
  assert.deepEqual(stageWaiting(st2.get(), 's4').map((d) => d.from.id), ['s3'], 'bloqueio real continua detectado');
  assert.deepEqual(computeIndicators(st2.get()).extra.waiting.stages.map((x) => x.id).sort(), ['s4', 's5'], 's4 aguarda s3; s5 aguarda s4 (aberta)');
});

test('caminho: rota entre etapas consecutivas usa as ligações reais (inclui etapas intermediárias)', () => {
  const s = createInitialState();
  const r = (id) => pathRoute(s, s.paths.find((p) => p.id === id));
  const cac = r('cacambas');
  assert.deepEqual([...cac.via].sort(), ['s3', 's6'], 'caçambas passam por 3 e 6 sem listá-las');
  assert.ok(cac.edges.has('s2>s3') && cac.edges.has('s3>s4') && cac.edges.has('s5>s6') && cac.edges.has('s6>s7') && cac.edges.has('s8>b_dest'));
  assert.deepEqual([...r('equipamentos').via], ['s3'], 'solicitação → orçamento passa pela recepção');
  assert.deepEqual([...r('munck').via].sort(), ['s3', 's6']);
  assert.ok(r('munck').edges.has('s3>b_munck') && r('munck').edges.has('b_munck>s4'));
  assert.deepEqual([...r('manutencao').via], []);
  assert.ok(r('manutencao').edges.has('s9>s11'));
  assert.ok(!cac.edges.has('s11>s5'), 'retornos não entram na rota');
});

test('migração v2 → v3 marca o retorno 11→5 sem tocar nos dados do usuário', () => {
  const old = createInitialState(); old.version = 2;
  old.edges.forEach((e) => delete e.loop);
  old.tasks.push({ id: 't1', stageId: 's3', title: 'minha', status: 'Pendente' });
  const storage = { m: new Map([[STORAGE_KEY, JSON.stringify(old)]]), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, v); } };
  const s = createStore({ storage }).get();
  assert.equal(s.version, 4);
  assert.equal(s.edges.find((e) => e.from === 's11' && e.to === 's5').loop, true);
  assert.equal(s.tasks[0].title, 'minha');
});
