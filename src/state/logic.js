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
  if (f.person) {
    const none = f.person === '__none';
    const ok = none ? !stage.ownerId
      : stage.ownerId === f.person || stage.substituteId === f.person ||
        stageTasks(state, stage.id).some((t) => t.ownerId === f.person);
    if (!ok) return false;
  }
  if (f.status || f.priority) {
    if (!stageTasks(state, stage.id).some((t) => taskMatches(t, { ...f, person: '' }))) return false;
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
  res.extra = {
    open: { label: 'Tarefas pendentes', value: state.tasks.length ? open.length : null, tasks: open },
    blocked: { label: 'Processos bloqueados', value: state.tasks.length ? blocked.length : null, tasks: blocked },
    noOwner: { label: 'Etapas sem responsável', value: stagesNoOwner.length, stages: stagesNoOwner },
    problems: { label: 'Problemas operacionais registrados', value: withProblems.length ? withProblems.reduce((n, s) => n + s.problems.length, 0) : null, stages: withProblems },
  };
  return res;
}
