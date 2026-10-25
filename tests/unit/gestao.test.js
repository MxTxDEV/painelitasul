import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/state/store.js';
import { stageProgress, dependencies, stageWaiting, handoffList, employeeRoles, employeeTasks, routineItems, computeIndicators } from '../../src/state/logic.js';
import { addDays } from '../../src/ui/routine.js';

const fresh = () => createStore({ storage: { getItem: () => null, setItem() {} } });

test('progresso da etapa: sem tarefas / em aberto / concluída', () => {
  const st = fresh();
  assert.equal(stageProgress(st.get(), 's3').state, 'sem-tarefas');
  const t = st.addTask({ stageId: 's3', title: 'x' });
  assert.equal(stageProgress(st.get(), 's3').state, 'em-aberto');
  st.completeTask(t.id);
  assert.equal(stageProgress(st.get(), 's3').state, 'concluida');
  st.reopenTask(t.id);
  assert.equal(stageProgress(st.get(), 's3').state, 'em-aberto');
});

test('dependência: etapa aguarda a anterior apenas quando ela tem tarefas em aberto', () => {
  const st = fresh();
  assert.deepEqual(stageWaiting(st.get(), 's4'), [], 'sem tarefas não se afirma nada');
  const t = st.addTask({ stageId: 's3', title: 'Encaminhar demanda' });
  const w = stageWaiting(st.get(), 's4');
  assert.deepEqual(w.map((d) => d.from.id), ['s3']);
  assert.equal(w[0].handoff, true, 's3 (Atendimento) → s4 (Comercial) é transferência de setor');
  assert.deepEqual(computeIndicators(st.get()).extra.waiting.stages.map((x) => x.id), ['s4'], 'só s4 (o ramal Munck é opcional e não bloqueia)');
  st.completeTask(t.id);
  assert.deepEqual(stageWaiting(st.get(), 's4'), []);
  assert.equal(computeIndicators(st.get()).extra.waiting.value, 0);
});

test('ramais são dependências opcionais e não geram alerta', () => {
  const st = fresh();
  st.addTask({ stageId: 'b_munck', title: 'Levantar necessidades' });
  const deps = dependencies(st.get(), 's4');
  assert.equal(deps.find((d) => d.from.id === 'b_munck').optional, true);
  assert.ok(!stageWaiting(st.get(), 's4').some((d) => d.from.id === 'b_munck'));
});

test('indicador de etapas aguardando: "Sem dados" quando não há tarefas', () => {
  assert.equal(computeIndicators(fresh().get()).extra.waiting.value, null);
});

test('transferências entre setores listam origem, destino e situação', () => {
  const st = fresh();
  const base = handoffList(st.get());
  assert.ok(base.length > 0 && base.every((h) => h.from.sector !== h.to.sector));
  assert.ok(base.some((h) => h.from.id === 's3' && h.to.id === 's4'));
  st.addTask({ stageId: 's3', title: 'x' });
  assert.equal(handoffList(st.get()).find((h) => h.from.id === 's3' && h.to.id === 's4').waiting, true);
});

test('papéis do funcionário nos processos: principal, substituto, participa', () => {
  const st = fresh();
  const e = st.addEmployee({ name: 'A', stageIds: ['s2', 's4'] });
  st.updateStage('s4', { ownerId: e.id }); st.updateStage('s5', { substituteId: e.id });
  const r = Object.fromEntries(employeeRoles(st.get(), e.id).map((x) => [x.stage.id, x.roles]));
  assert.deepEqual(r, { s2: ['Participa'], s4: ['Responsável principal'], s5: ['Substituto'] });
});

test('rotina: tarefas por pessoa e dia, com carregadas, sem prazo e filtros', () => {
  const st = fresh();
  const a = st.addEmployee({ name: 'A' }), b = st.addEmployee({ name: 'B' });
  const D = '2026-05-10';
  const mk = (title, o) => st.addTask({ stageId: 's1', title, ownerId: a.id, ...o });
  mk('hoje', { due: D });
  mk('ontem aberta', { due: addDays(D, -1) });
  const done = mk('ontem feita', { due: addDays(D, -1) }); st.completeTask(done.id);
  mk('amanhã', { due: addDays(D, 1) });
  mk('sem prazo');
  mk('bloqueada hoje', { due: D, status: 'Bloqueada' });
  st.addTask({ stageId: 's1', title: 'da B', ownerId: b.id, due: D });
  st.addTask({ stageId: 's1', title: 'sem dono', due: D });
  const titles = (x) => x.map((t) => t.title).sort();
  const R = (o) => routineItems(st.get(), { day: D, ...o }, D);
  let r = R({ person: a.id });
  assert.deepEqual(titles(r.day), ['bloqueada hoje', 'hoje']);
  assert.deepEqual(titles(r.carried), ['ontem aberta']);
  assert.deepEqual(titles(r.undated), ['sem prazo']);
  assert.deepEqual(titles(R({ person: b.id }).day), ['da B']);
  assert.deepEqual(titles(R({ person: '__none' }).day), ['sem dono']);
  assert.equal(R({}).day.length, 4);
  assert.deepEqual(titles(R({ person: a.id, groups: ['bloqueadas'] }).day), ['bloqueada hoje']);
  assert.deepEqual(titles(R({ person: a.id, groups: ['atrasadas'] }).carried), ['ontem aberta']);
  assert.deepEqual(titles(R({ person: a.id, groups: ['atrasadas'] }).day), []);
  assert.deepEqual(titles(routineItems(st.get(), { person: a.id, day: addDays(D, -1), groups: ['concluidas'] }, D).day), ['ontem feita']);
  assert.deepEqual(titles(R({ person: a.id, groups: ['pendentes', 'bloqueadas'] }).day), ['bloqueada hoje', 'hoje']);
  assert.equal(employeeTasks(st.get(), a.id).length, 6);
});

test('addDays atravessa meses e anos', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('mover tarefa de etapa e persistir campos do formulário', () => {
  const st = fresh();
  const t = st.addTask({ stageId: 's1', title: 'T', frequency: 'Semanal', notes: 'obs' });
  st.updateTask(t.id, { stageId: 's2' });
  assert.equal(st.get().tasks[0].stageId, 's2'); assert.equal(st.get().tasks[0].frequency, 'Semanal');
  assert.equal(st.get().history[0].stageId, 's2');
});
