// Revisão das conexões e dependências dos fluxos: integridade do grafo e fidelidade ao que foi especificado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/data/seed.js';
import { createStore } from '../../src/state/store.js';
import { pathRoute, stageWaiting, dependencies, handoffList } from '../../src/state/logic.js';

const S = createInitialState();
const ids = new Set(S.stages.map((s) => s.id));
const fresh = () => createStore({ storage: { getItem: () => null, setItem() {} } });
const reach = (from) => { const seen = new Set([from]), q = [from]; while (q.length) { const c = q.shift(); for (const e of S.edges) if (e.from === c && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); } } return seen; };

test('grafo: ligações válidas, sem duplicatas nem laços em si mesmas; todas as etapas alcançáveis a partir da etapa 1', () => {
  const keys = S.edges.map((e) => `${e.from}>${e.to}`);
  assert.equal(new Set(keys).size, keys.length, 'ligação duplicada');
  for (const e of S.edges) { assert.ok(ids.has(e.from) && ids.has(e.to), `ligação para etapa inexistente ${e.from}>${e.to}`); assert.notEqual(e.from, e.to); }
  assert.deepEqual([...ids].filter((i) => !reach('s1').has(i)), [], 'etapas inalcançáveis');
});

test('toda etapa tem entradas, atividades e saída clara; só o retorno 11→5 é marcado como loop', () => {
  for (const s of S.stages) { assert.ok(s.inputs.length && s.outputs.length && s.activities.length, `${s.id} incompleta`); }
  assert.deepEqual(S.edges.filter((e) => e.loop).map((e) => `${e.from}>${e.to}`), ['s11>s5']);
});

test('fluxo principal: sequência 1→2→3→4→5→6→7 e ramificações 7→8, 7→9, 9→10, 9→11 conforme o briefing', () => {
  const has = (a, b) => S.edges.some((e) => e.from === a && e.to === b);
  for (const [a, b] of [['s1', 's2'], ['s2', 's3'], ['s3', 's4'], ['s4', 's5'], ['s5', 's6'], ['s6', 's7'], ['s7', 's8'], ['s7', 's9'], ['s9', 's10'], ['s9', 's11'], ['s11', 's5'], ['s3', 'b_munck'], ['b_munck', 's4'], ['s8', 'b_dest']]) assert.ok(has(a, b), `falta ${a}→${b}`);
  assert.equal(S.edges.length, 14, 'nenhuma ligação extra inesperada');
});

const SPEC = {
  cacambas: ['Solicitação', 'Orçamento', 'Disponibilidade da caçamba', 'Agendamento', 'Entrega', 'Retirada', 'Registro financeiro', 'Destinação adequada e encerramento'],
  equipamentos: ['Solicitação', 'Orçamento', 'Disponibilidade', 'Preparação', 'Contrato', 'Entrega ou retirada', 'Devolução', 'Inspeção'],
  munck: ['Solicitação', 'Análise das necessidades', 'Orçamento', 'Disponibilidade e condições de execução', 'Agendamento', 'Execução', 'Registro financeiro'],
  manutencao: ['Defeito identificado', 'Equipamento bloqueado (se necessário)', 'Diagnóstico', 'Peças', 'Reparo', 'Teste de segurança', 'Liberação'],
};
for (const [id, labels] of Object.entries(SPEC)) {
  test(`caminho "${id}": passos na ordem do briefing, em etapas existentes, com rota contínua pelas ligações reais`, () => {
    const p = S.paths.find((x) => x.id === id);
    assert.deepEqual(p.steps.map((x) => x.label), labels);
    assert.ok(p.steps.every((x) => ids.has(x.stageId)), 'passo aponta para etapa inexistente');
    const route = pathRoute(S, p), seq = p.steps.map((x) => x.stageId);
    for (let i = 0; i < seq.length - 1; i++) if (seq[i] !== seq[i + 1]) {
      const walk = new Set([seq[i]]), q = [seq[i]];
      while (q.length) { const c = q.shift(); for (const k of route.edges) { const [a, b] = k.split('>'); if (a === c && !walk.has(b)) { walk.add(b); q.push(b); } } }
      assert.ok(walk.has(seq[i + 1]), `sem rota ${seq[i]} → ${seq[i + 1]}`);
    }
  });
}

test('manutenção: defeito na inspeção (9) leva à manutenção (11); a liberação retorna à disponibilidade (5) sem bloquear', () => {
  const st = fresh();
  st.addTask({ stageId: 's9', title: 'Inspeção em andamento' });
  assert.deepEqual(stageWaiting(st.get(), 's11').map((d) => d.from.id), ['s9']);
  st.addTask({ stageId: 's11', title: 'Reparo em andamento' });
  assert.deepEqual(stageWaiting(st.get(), 's5').map((d) => d.from.id), [], 'retorno 11→5 não bloqueia');
});

test('caçambas/Munck: tarefa aberta no fechamento (6) bloqueia a operação (7); ramais não bloqueiam o orçamento (4)', () => {
  const st = fresh();
  st.addTask({ stageId: 's6', title: 'Registrar locação' }); st.addTask({ stageId: 's7', title: 'Agendar' });
  assert.deepEqual(stageWaiting(st.get(), 's7').map((d) => d.from.id), ['s6']);
  st.addTask({ stageId: 'b_munck', title: 'Levantar necessidades' }); st.addTask({ stageId: 's4', title: 'Orçar' });
  assert.deepEqual(stageWaiting(st.get(), 's4').map((d) => d.from.id), [], 'análise Munck é opcional');
  assert.equal(dependencies(st.get(), 's4').find((d) => d.from.id === 'b_munck').optional, true);
});

test('transferências entre setores: todas as ligações com setor diferente são listadas (e só elas)', () => {
  const diff = S.edges.filter((e) => S.stages.find((s) => s.id === e.from).sector !== S.stages.find((s) => s.id === e.to).sector).length;
  assert.equal(handoffList(S).length, diff);
});

test('migração v3 → v4: etapas padrão vão para o novo layout; dados e etapas do usuário são preservados', async () => {
  const { STORAGE_KEY } = await import('../../src/state/store.js');
  const { NODE_H, ROW } = await import('../../src/data/seed.js');
  const old = createInitialState(); old.version = 3;
  old.stages.forEach((s) => { s.x = 7; s.y = 7; });
  old.stages.push({ ...old.stages[0], id: 's_meu', name: 'Minha etapa', num: null, x: 40, y: 870 });
  old.stages.find((s) => s.id === 's4').ownerId = 'e1';
  old.employees.push({ id: 'e1', name: 'Pessoa Real', stageIds: ['s4'] });
  old.tasks.push({ id: 't1', stageId: 's4', title: 'Minha tarefa', status: 'Pendente' });
  const m = new Map([[STORAGE_KEY, JSON.stringify(old)]]);
  const s = createStore({ storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }).get();
  const seed = createInitialState().stages.find((x) => x.id === 's4'), cur = s.stages.find((x) => x.id === 's4');
  assert.deepEqual([cur.x, cur.y], [seed.x, seed.y]);
  assert.equal(cur.ownerId, 'e1', 'responsável preservado');
  assert.equal(s.tasks[0].title, 'Minha tarefa'); assert.equal(s.employees[0].name, 'Pessoa Real');
  const mine = s.stages.find((x) => x.id === 's_meu');
  assert.ok(mine.y >= Math.max(...createInitialState().stages.map((x) => x.y)) + ROW - 1 && mine.y > seed.y + NODE_H, 'etapa do usuário abaixo do layout, sem sobreposição');
  assert.equal(s.version, 4);
});
