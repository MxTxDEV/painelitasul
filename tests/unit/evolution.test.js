import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY, validateState } from '../../src/state/store.js';
import { computeIndicators, participants, stageIssues } from '../../src/state/logic.js';
import { createInitialState, SEED_STAGES, SEED_EDGES } from '../../src/data/seed.js';

const fakeStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const fresh = () => createStore({ storage: fakeStorage() });

test('tarefa: criar → editar → concluir → reabrir, com histórico e data de conclusão', () => {
  const st = fresh();
  const t = st.addTask({ stageId: 's4', title: 'Enviar orçamento', ownerId: null, priority: 'Alta', due: '2026-12-01', notes: 'n' });
  st.updateTask(t.id, { description: 'detalhe', priority: 'Urgente' });
  st.completeTask(t.id);
  let cur = st.get().tasks[0];
  assert.equal(cur.status, 'Concluída'); assert.ok(cur.completedAt);
  assert.equal(computeIndicators(st.get()).extra.open.value, 0);
  st.reopenTask(t.id);
  cur = st.get().tasks[0];
  assert.equal(cur.status, 'Pendente'); assert.equal(cur.completedAt, '');
  assert.equal(computeIndicators(st.get()).extra.open.value, 1);
  assert.deepEqual(st.get().history.slice(0, 2).map((h) => h.text.split(':')[0]), ['Tarefa reaberta', 'Tarefa concluída']);
});

test('vincular funcionário a etapas não o torna responsável e não duplica cadastro', () => {
  const st = fresh();
  const e = st.addEmployee({ name: 'Pessoa X' });
  st.linkEmployee(e.id, 's2'); st.linkEmployee(e.id, 's2'); st.linkEmployee(e.id, 's9');
  assert.equal(st.get().employees.length, 1);
  assert.deepEqual(st.get().employees[0].stageIds.sort(), ['s2', 's9']);
  assert.equal(participants(st.get(), 's2').length, 1);
  assert.equal(stageIssues(st.get(), st.get().stages.find((s) => s.id === 's2')).noOwner, true, 'continua A definir');
  assert.ok(st.get().stages.every((s) => s.ownerId === null));
  st.linkEmployee(e.id, 's2', false);
  assert.equal(participants(st.get(), 's2').length, 0);
});

test('indicadores derivados de registros; sem registro → "Sem dados"', () => {
  const st = fresh();
  assert.equal(computeIndicators(st.get()).quotesOpen.value, null);
  st.addRecord({ kind: 'Orçamento', title: 'A', status: 'Aberto' });
  st.addRecord({ kind: 'Orçamento', title: 'B', status: 'Aguardando retorno' });
  st.addRecord({ kind: 'Orçamento', title: 'C', status: 'Concluído' });
  st.addRecord({ kind: 'Locação', title: 'L', status: 'Em andamento' });
  st.addRecord({ kind: 'Entrega', title: 'E1', status: 'Programado' });
  st.addRecord({ kind: 'Entrega', title: 'E2', status: 'Cancelado' });
  st.addRecord({ kind: 'Pendência financeira', title: 'P', status: 'Aberto' });
  st.addRecord({ kind: 'Equipamento indisponível', title: 'Q', status: 'Em andamento' });
  st.addRecord({ kind: 'Manutenção', title: 'M', status: 'Aberto' });
  let i = computeIndicators(st.get());
  assert.deepEqual([i.quotesOpen.value, i.quotesAwaiting.value, i.rentalsActive.value, i.deliveriesPlanned.value, i.financePending.value, i.equipmentDown.value, i.maintenancePending.value], [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(i.quotesOpen.records[0].title, 'A');
  const loc = st.get().records.find((r) => r.kind === 'Locação');
  st.updateRecord(loc.id, { status: 'Concluído' });
  assert.equal(computeIndicators(st.get()).rentalsActive.value, 0, 'existem registros do tipo, nenhum ativo → 0 (não null)');
  st.addTask({ stageId: 's11', title: 'Reparar' });
  assert.equal(computeIndicators(st.get()).maintenancePending.value, 2);
  assert.throws(() => st.addRecord({ title: ' ' }));
});

test('valor manual só vale sem registros do tipo', () => {
  const st = fresh();
  st.setMetric('rentalsActive', 4);
  assert.equal(computeIndicators(st.get()).rentalsActive.value, 4);
  assert.equal(computeIndicators(st.get()).rentalsActive.manual, true);
  st.addRecord({ kind: 'Locação', title: 'L', status: 'Em andamento' });
  assert.equal(computeIndicators(st.get()).rentalsActive.value, 1);
  assert.equal(computeIndicators(st.get()).rentalsActive.manual, undefined);
});

test('excluir funcionário/etapa limpa referências em registros', () => {
  const st = fresh();
  const e = st.addEmployee({ name: 'Z' });
  st.addRecord({ title: 'R', stageId: 's1', ownerId: e.id });
  st.deleteEmployee(e.id); assert.equal(st.get().records[0].ownerId, null);
  st.deleteStage('s1'); assert.equal(st.get().records[0].stageId, null);
});

test('migração v1 → v2 preserva dados do usuário e reposiciona o layout padrão', () => {
  const v1 = createInitialState();
  v1.version = 1; delete v1.records;
  v1.stages.forEach((s) => { s.x = 5; s.y = 5; });
  v1.stages.push({ ...v1.stages[0], id: 's_custom', name: 'Minha etapa', num: null });
  v1.tasks.push({ id: 't1', stageId: 's4', title: 'Minha tarefa', status: 'Pendente' });
  v1.employees.push({ id: 'e1', name: 'Fulano', stageIds: ['s4'] });
  const storage = fakeStorage(); storage.setItem(STORAGE_KEY, JSON.stringify(v1));
  const s = createStore({ storage }).get();
  assert.equal(s.version, 3); assert.deepEqual(s.records, []);
  assert.equal(s.tasks[0].title, 'Minha tarefa'); assert.equal(s.employees[0].name, 'Fulano');
  const seed4 = SEED_STAGES.find((x) => x.id === 's4');
  const st4 = s.stages.find((x) => x.id === 's4');
  assert.deepEqual([st4.x, st4.y], [seed4.x, seed4.y]);
  const custom = s.stages.find((x) => x.id === 's_custom');
  assert.ok(custom.y > Math.max(...SEED_STAGES.map((x) => x.y)), 'etapa própria não sobrepõe o layout');
});

test('importação aceita arquivo antigo sem "records" e rejeita versão futura', () => {
  const old = createInitialState(); old.version = 1; delete old.records;
  assert.deepEqual(validateState(old).records, []);
  assert.throws(() => validateState({ ...createInitialState(), version: 99 }));
  assert.throws(() => validateState({ ...createInitialState(), records: 'x' }));
});

test('layout padrão: cartões sem sobreposição e setas sem cruzamento nem passagem por cima de cartões', () => {
  const W = 260, H = 164, st = new Map(SEED_STAGES.map((s) => [s.id, s]));
  const c = (s) => [s.x + W / 2, s.y + H / 2];
  const rect = (s) => ({ l: s.x, r: s.x + W, t: s.y, b: s.y + H });
  const list = SEED_STAGES;
  for (const a of list) for (const b of list) if (a.id < b.id) {
    const A = rect(a), B = rect(b);
    assert.ok(A.r <= B.l || B.r <= A.l || A.b <= B.t || B.b <= A.t, `${a.id} e ${b.id} sobrepostos`);
  }
  const ccw = (p, q, r) => (r[1] - p[1]) * (q[0] - p[0]) - (q[1] - p[1]) * (r[0] - p[0]);
  const cross = (p1, p2, p3, p4) => ccw(p1, p3, p4) * ccw(p2, p3, p4) < 0 && ccw(p1, p2, p3) * ccw(p1, p2, p4) < 0;
  const segs = SEED_EDGES.map((e) => ({ e, a: c(st.get(e.from)), b: c(st.get(e.to)) }));
  for (const s1 of segs) for (const s2 of segs) if (s1.e !== s2.e && ![s1.e.from, s1.e.to].some((x) => x === s2.e.from || x === s2.e.to)) {
    assert.ok(!cross(s1.a, s1.b, s2.a, s2.b), `cruzamento: ${s1.e.from}→${s1.e.to} × ${s2.e.from}→${s2.e.to}`);
  }
  for (const { e, a, b } of segs) for (const s of list) if (s.id !== e.from && s.id !== e.to) {
    for (let k = 1; k < 20; k++) {
      const p = [a[0] + (b[0] - a[0]) * k / 20, a[1] + (b[1] - a[1]) * k / 20], R = rect(s);
      assert.ok(!(p[0] > R.l && p[0] < R.r && p[1] > R.t && p[1] < R.b), `seta ${e.from}→${e.to} passa sobre ${s.id}`);
    }
  }
});
