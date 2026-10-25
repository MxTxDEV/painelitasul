import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY } from '../../src/state/store.js';
import { computeIndicators, isOverdue, stageIssues, stageMatches, EMPTY_FILTERS, participants, stagesOf, isHandoff } from '../../src/state/logic.js';

const fakeStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

test('estado inicial: 11 etapas, 4 caminhos, nenhum dado inventado', () => {
  const s = createStore({ storage: fakeStorage() }).get();
  assert.equal(s.stages.filter((x) => x.kind === 'stage').length, 11);
  assert.equal(s.paths.length, 4);
  assert.equal(s.tasks.length + s.employees.length + s.improvements.length, 0);
  assert.ok(s.stages.every((x) => x.ownerId === null && x.inputs.length && x.outputs.length));
});

test('persistência: recarregar mantém os dados', () => {
  const storage = fakeStorage();
  const a = createStore({ storage });
  a.addTask({ stageId: 's4', title: 'Ligar para clientes' });
  const b = createStore({ storage });
  assert.equal(b.get().tasks[0].title, 'Ligar para clientes');
});

test('storage corrompido cai para o estado inicial sem lançar erro', () => {
  const storage = fakeStorage(); storage.setItem(STORAGE_KEY, '{ruim');
  assert.equal(createStore({ storage }).get().stages.length, 13);
});

test('tarefa: título obrigatório, edição e status', () => {
  const st = createStore({ storage: fakeStorage() });
  assert.throws(() => st.addTask({ stageId: 's1', title: '  ' }));
  const t = st.addTask({ stageId: 's1', title: 'X' });
  assert.equal(t.status, 'Pendente'); assert.equal(t.ownerId, null);
  st.updateTask(t.id, { status: 'Bloqueada', priority: 'Alta' });
  assert.equal(st.get().tasks[0].status, 'Bloqueada');
  assert.match(st.get().history[0].text, /Bloqueada/);
});

test('atraso: só com prazo vencido e não concluída', () => {
  assert.equal(isOverdue({ due: '2026-01-01', status: 'Pendente' }, '2026-01-02'), true);
  assert.equal(isOverdue({ due: '2026-01-01', status: 'Concluída' }, '2026-01-02'), false);
  assert.equal(isOverdue({ due: '', status: 'Pendente' }, '2026-01-02'), false);
  assert.equal(isOverdue({ due: '2026-01-02', status: 'Pendente' }, '2026-01-02'), false);
});

test('indicadores: "Sem dados" (null) sem cadastro; calculados a partir de tarefas', () => {
  const st = createStore({ storage: fakeStorage() });
  let ind = computeIndicators(st.get(), '2026-06-10');
  assert.ok(Object.entries(ind).filter(([k]) => k !== 'extra').every(([, v]) => v.value === null));
  st.addTask({ stageId: 's11', title: 'Reparo', due: '2026-06-01' });
  st.addTask({ stageId: 's4', title: 'Orçar', due: '2026-07-01', status: 'Bloqueada' });
  ind = computeIndicators(st.get(), '2026-06-10');
  assert.equal(ind.tasksOverdue.value, 1);
  assert.equal(ind.maintenancePending.value, 1);
  assert.equal(ind.extra.blocked.value, 1);
  st.setMetric('rentalsActive', 0);
  assert.equal(computeIndicators(st.get()).rentalsActive.value, 0);
  st.setMetric('rentalsActive', '');
  assert.equal(computeIndicators(st.get()).rentalsActive.value, null);
  assert.throws(() => st.setMetric('rentalsActive', -3));
});

test('etapas sem responsável são sinalizadas; funcionário vincula várias etapas sem duplicar', () => {
  const st = createStore({ storage: fakeStorage() });
  const e = st.addEmployee({ name: 'Pessoa A', stageIds: ['s2', 's3'] });
  st.updateStage('s4', { ownerId: e.id });
  assert.equal(st.get().employees.length, 1);
  assert.deepEqual(stagesOf(st.get(), e.id).map((s) => s.id).sort(), ['s2', 's3', 's4']);
  assert.equal(participants(st.get(), 's2')[0].id, e.id);
  assert.equal(stageIssues(st.get(), st.get().stages.find((s) => s.id === 's4')).noOwner, false);
  assert.equal(stageIssues(st.get(), st.get().stages.find((s) => s.id === 's5')).noOwner, true);
  st.deleteEmployee(e.id);
  assert.equal(st.get().stages.find((s) => s.id === 's4').ownerId, null);
});

test('filtros por setor, responsável, status e prioridade', () => {
  const st = createStore({ storage: fakeStorage() });
  const e = st.addEmployee({ name: 'B' });
  st.addTask({ stageId: 's8', title: 'Cobrar', ownerId: e.id, priority: 'Urgente', status: 'Em andamento' });
  const s = st.get(), f = (o) => ({ ...EMPTY_FILTERS, ...o });
  const match = (o) => s.stages.filter((x) => stageMatches(s, x, f(o))).map((x) => x.id);
  assert.deepEqual(match({ sector: 'Financeiro' }), ['s8']);
  assert.deepEqual(match({ person: e.id }), ['s8']);
  assert.deepEqual(match({ status: 'Em andamento', priority: 'Urgente' }), ['s8']);
  assert.deepEqual(match({ status: 'Concluída' }), []);
  assert.equal(match({}).length, 13);
});

test('transferências de responsabilidade = ligações entre setores', () => {
  const s = createStore({ storage: fakeStorage() }).get();
  const e = (a, b) => s.edges.find((x) => x.from === a && x.to === b);
  assert.equal(isHandoff(s, e('s2', 's3')), false);
  assert.equal(isHandoff(s, e('s3', 's4')), true);
});

test('excluir etapa com tarefas é bloqueado; sem tarefas remove ligações', () => {
  const st = createStore({ storage: fakeStorage() });
  const t = st.addTask({ stageId: 's1', title: 'a' });
  assert.throws(() => st.deleteStage('s1'));
  st.deleteTask(t.id); st.deleteStage('s1');
  assert.ok(!st.get().edges.some((e) => e.from === 's1' || e.to === 's1'));
});

test('importar valida, guarda cópia de segurança e não perde dados em arquivo inválido', () => {
  const st = createStore({ storage: fakeStorage() });
  st.addTask({ stageId: 's1', title: 'Original' });
  assert.throws(() => st.importJSON('{"x":1}'));
  assert.throws(() => st.importJSON('lixo'));
  assert.equal(st.get().tasks.length, 1);
  const other = createStore({ storage: fakeStorage() });
  st.importJSON(other.exportJSON());
  assert.equal(st.get().tasks.length, 0);
  assert.ok(st.hasBackup());
  st.restoreBackup();
  assert.equal(st.get().tasks[0].title, 'Original');
});

test('sugestão de melhoria vinculada a etapa/tarefa/funcionário', () => {
  const st = createStore({ storage: fakeStorage() });
  const i = st.addImprovement({ title: 'Ideia', link: { type: 'stage', id: 's9' } });
  assert.equal(i.status, 'Nova');
  st.updateImprovement(i.id, { status: 'Em avaliação' });
  assert.equal(computeIndicators(st.get()).improvementsReview.value, 1);
  st.deleteStage('s9');
  assert.equal(st.get().improvements[0].link, null);
});
