// Funções puras de consulta/cálculo sobre o estado. Sem DOM, sem efeitos colaterais.
import { METRIC_DEFS } from '../data/seed.js';

export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isOverdue = (task, today = todayISO()) =>
  Boolean(task.due) && task.status !== 'Concluída' && task.due < today;

export const byId = (list, id) => list.find((x) => x.id === id) || null;
export const personName = (state, id) => byId(state.employees, id)?.name ?? 'A definir';

export const stageTasks = (state, stageId) => state.tasks.filter((t) => t.stageId === stageId);

export function stageIssues(state, stage, today = todayISO()) {
  const tasks = stageTasks(state, stage.id);
  return {
    noOwner: !stage.ownerId,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    blocked: tasks.filter((t) => t.status === 'Bloqueada').length,
    open: tasks.filter((t) => t.status !== 'Concluída').length,
    problems: stage.problems.length,
  };
}

// Pessoas ligadas a uma etapa: responsável, substituto e quem marcou a etapa em "participa".
export function participants(state, stageId) {
  const s = byId(state.stages, stageId);
  return state.employees.filter((e) =>
    e.id === s?.ownerId || e.id === s?.substituteId || (e.stageIds || []).includes(stageId));
}

export function stagesOf(state, employeeId) {
  return state.stages.filter((s) =>
    s.ownerId === employeeId || s.substituteId === employeeId ||
    (byId(state.employees, employeeId)?.stageIds || []).includes(s.id));
}

export const neighbours = (state, stageId) => ({
  prev: state.edges.filter((e) => e.to === stageId).map((e) => byId(state.stages, e.from)).filter(Boolean),
  next: state.edges.filter((e) => e.from === stageId).map((e) => byId(state.stages, e.to)).filter(Boolean),
});

// Transferência de responsabilidade = ligação entre setores diferentes.
export const isHandoff = (state, edge) => {
  const a = byId(state.stages, edge.from), b = byId(state.stages, edge.to);
  return Boolean(a && b && a.sector !== b.sector);
};

export const EMPTY_FILTERS = { sector: '', person: '', status: '', priority: '' };
export const hasFilters = (f) => Object.values(f).some(Boolean);

export function taskMatches(task, f) {
  return (!f.person || task.ownerId === f.person || (f.person === '__none' && !task.ownerId)) &&
    (!f.status || task.status === f.status) &&
    (!f.priority || task.priority === f.priority);
}

export function stageMatches(state, stage, f) {
  if (!hasFilters(f)) return true;
  if (f.sector && stage.sector !== f.sector) return false;
  const tasks = stageTasks(state, stage.id);
  if (f.status || f.priority) {
    // Com status/prioridade, a MESMA tarefa precisa casar com todos os filtros (inclusive o responsável).
    return tasks.some((t) => taskMatches(t, f));
  }
  if (f.person) {
    return f.person === '__none' ? !stage.ownerId
      : stage.ownerId === f.person || stage.substituteId === f.person || tasks.some((t) => t.ownerId === f.person);
  }
  return true;
}

export const RECORD_DONE = ['Concluído', 'Cancelado'];
export const recordActive = (r) => !RECORD_DONE.includes(r.status);

// Definição de cada indicador de registros: tipo + quais status contam.
const RECORD_RULES = {
  quotesOpen: { kind: 'Orçamento', match: (r) => r.status === 'Aberto' },
  quotesAwaiting: { kind: 'Orçamento', match: (r) => r.status === 'Aguardando retorno' },
  rentalsActive: { kind: 'Locação', match: (r) => r.status === 'Em andamento' },
  deliveriesPlanned: { kind: 'Entrega', match: (r) => r.status === 'Aberto' || r.status === 'Programado' },
  financePending: { kind: 'Pendência financeira', match: recordActive },
  equipmentDown: { kind: 'Equipamento indisponível', match: recordActive },
};

// Cada indicador devolve { value: number|null, tasks/records/stages/improvements } — null = "Sem dados registrados".
// Registros cadastrados têm prioridade; sem nenhum registro do tipo, vale o número informado manualmente (marcado "manual").
export function computeIndicators(state, today = todayISO()) {
  const open = state.tasks.filter((t) => t.status !== 'Concluída');
  const overdue = state.tasks.filter((t) => isOverdue(t, today));
  const res = {};
  for (const def of METRIC_DEFS) {
    const base = { key: def.key, label: def.label };
    const rule = RECORD_RULES[def.key];
    if (rule) {
      const ofKind = state.records.filter((r) => r.kind === rule.kind);
      const list = ofKind.filter(rule.match);
      const manual = state.metrics[def.key];
      if (ofKind.length) res[def.key] = { ...base, value: list.length, records: list, kind: rule.kind };
      else res[def.key] = { ...base, value: Number.isFinite(manual) ? manual : null, records: [], kind: rule.kind, manual: Number.isFinite(manual) };
    } else if (def.key === 'tasksOverdue') {
      res[def.key] = { ...base, value: state.tasks.length ? overdue.length : null, tasks: overdue };
    } else if (def.key === 'maintenancePending') {
      const tasks = state.tasks.filter((t) => t.stageId === 's11' && t.status !== 'Concluída');
      const records = state.records.filter((r) => r.kind === 'Manutenção' && recordActive(r));
      const any = state.tasks.some((t) => t.stageId === 's11') || state.records.some((r) => r.kind === 'Manutenção');
      res[def.key] = { ...base, value: any ? tasks.length + records.length : null, tasks, records, kind: 'Manutenção' };
    } else {
      const list = state.improvements.filter((i) => i.status === 'Em avaliação');
      res[def.key] = { ...base, value: state.improvements.length ? list.length : null, improvements: list };
    }
  }
  const blocked = state.tasks.filter((t) => t.status === 'Bloqueada');
  const stagesNoOwner = state.stages.filter((s) => !s.ownerId);
  const withProblems = state.stages.filter((s) => s.problems.length);
  const waitingStages = state.stages.filter((st) => stageWaiting(state, st.id).length);
  res.extra = {
    open: { label: 'Tarefas pendentes', value: state.tasks.length ? open.length : null, tasks: open },
    blocked: { label: 'Processos bloqueados', value: state.tasks.length ? blocked.length : null, tasks: blocked },
    noOwner: { label: 'Etapas sem responsável', value: stagesNoOwner.length, stages: stagesNoOwner },
    waiting: { label: 'Etapas aguardando etapa anterior', value: state.tasks.length ? waitingStages.length : null, stages: waitingStages },
    problems: { label: 'Problemas operacionais registrados', value: withProblems.length ? withProblems.reduce((n, s) => n + s.problems.length, 0) : null, stages: withProblems },
  };
  return res;
}

// ---------- Progresso, dependências e transferências ----------
// Uma etapa só é "concluída" quando tem tarefas e todas estão concluídas. Sem tarefas não dá para afirmar nada.
export function stageProgress(state, stageId) {
  const t = stageTasks(state, stageId);
  const open = t.filter((x) => x.status !== 'Concluída').length;
  return { total: t.length, open, done: t.length - open, state: !t.length ? 'sem-tarefas' : open ? 'em-aberto' : 'concluida' };
}

// Dependências = ligações que chegam na etapa. Só BLOQUEIA quando: a ligação não é um retorno (loop), nenhuma das pontas
// é um ramal opcional, a etapa de origem tem tarefas em aberto e a etapa de destino ainda não foi concluída.
const edgeBlocks = (state, e, from, to) =>
  !e.loop && from.kind !== 'branch' && to.kind !== 'branch' &&
  stageProgress(state, from.id).state === 'em-aberto' && stageProgress(state, to.id).state !== 'concluida';

export const edgeWaiting = (state, e) => {
  const from = byId(state.stages, e.from), to = byId(state.stages, e.to);
  return Boolean(from && to && edgeBlocks(state, e, from, to));
};

export function dependencies(state, stageId) {
  const to = byId(state.stages, stageId);
  return state.edges.filter((e) => e.to === stageId).map((e) => {
    const from = byId(state.stages, e.from);
    if (!from || !to) return null;
    return { from, progress: stageProgress(state, from.id), loop: Boolean(e.loop), optional: from.kind === 'branch' || to.kind === 'branch',
      handoff: from.sector !== to.sector, waiting: edgeBlocks(state, e, from, to) };
  }).filter(Boolean);
}

export const stageWaiting = (state, stageId) => dependencies(state, stageId).filter((d) => d.waiting);

export function handoffList(state) {
  return state.edges.map((e) => {
    const from = byId(state.stages, e.from), to = byId(state.stages, e.to);
    return from && to && from.sector !== to.sector ? { edge: e, from, to, progress: stageProgress(state, from.id), waiting: edgeBlocks(state, e, from, to) } : null;
  }).filter(Boolean);
}

// ---------- Equipe e rotina ----------
export const employeeTasks = (state, id) => state.tasks.filter((t) => t.ownerId === id);

export function employeeRoles(state, id) {
  const e = byId(state.employees, id);
  return state.stages.map((s) => {
    const roles = [];
    if (s.ownerId === id) roles.push('Responsável principal');
    if (s.substituteId === id) roles.push('Substituto');
    if (!roles.length && (e?.stageIds || []).includes(s.id)) roles.push('Participa');
    return roles.length ? { stage: s, roles } : null;
  }).filter(Boolean);
}

export const ROUTINE_GROUPS = [['pendentes', 'Pendentes'], ['concluidas', 'Concluídas'], ['atrasadas', 'Atrasadas'], ['bloqueadas', 'Bloqueadas']];
const GROUP_TEST = {
  pendentes: (t) => t.status !== 'Concluída',
  concluidas: (t) => t.status === 'Concluída',
  atrasadas: (t, today) => isOverdue(t, today),
  bloqueadas: (t) => t.status === 'Bloqueada',
};

// person: '' = todos · '__none' = sem responsável (A definir) · id. groups vazio = sem filtro.
export function routineItems(state, { person = '', day, groups = [] }, today = todayISO()) {
  const pass = (t) => !groups.length || groups.some((g) => GROUP_TEST[g](t, today));
  const mine = state.tasks.filter((t) => (!person || (person === '__none' ? !t.ownerId : t.ownerId === person)) && pass(t));
  return {
    day: mine.filter((t) => t.due === day),
    carried: mine.filter((t) => t.due && t.due < day && t.status !== 'Concluída'),
    undated: mine.filter((t) => !t.due),
  };
}

// Rota de um caminho específico: para cada par de etapas consecutivas (distintas), o menor trajeto pelas ligações reais
// (sem retornos). "via" = etapas atravessadas que não estão listadas no caminho.
export function pathRoute(state, path) {
  const listed = [...new Set(path.steps.map((x) => x.stageId).filter(Boolean))];
  const edges = new Set(), via = new Set();
  const out = (id) => state.edges.filter((e) => e.from === id && !e.loop).map((e) => e.to);
  const seq = path.steps.map((x) => x.stageId).filter(Boolean);
  for (let i = 0; i < seq.length - 1; i++) {
    const [a, b] = [seq[i], seq[i + 1]];
    if (a === b) continue;
    const prev = new Map([[a, null]]); const queue = [a];
    while (queue.length && !prev.has(b)) {
      const cur = queue.shift();
      for (const n of out(cur)) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
    }
    if (!prev.has(b)) continue;
    for (let n = b; prev.get(n); n = prev.get(n)) {
      edges.add(`${prev.get(n)}>${n}`);
      if (prev.get(n) !== a && !listed.includes(prev.get(n))) via.add(prev.get(n));
    }
  }
  return { edges, via };
}
