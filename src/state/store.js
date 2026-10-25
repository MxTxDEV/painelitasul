// Estado + persistência. O storage é injetável (localStorage no navegador, objeto falso nos testes).
import { createInitialState, SEED_STAGES, STATE_VERSION, ROW, METRIC_DEFS } from '../data/seed.js';

export const STORAGE_KEY = 'itasul-painel-v1';
export const BACKUP_KEY = 'itasul-painel-v1-backup';
const MAX_HISTORY = 300;
const LISTS = ['stages', 'edges', 'paths', 'tasks', 'employees', 'improvements', 'history'];

const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Valida e migra (v1 → v2 → v3) sem perder nada do usuário: só acrescenta "records" e reposiciona etapas do layout padrão.
export function validateState(data) {
  if (!data || typeof data !== 'object') throw new Error('Arquivo inválido: não é um objeto JSON.');
  if (typeof data.version !== 'number') throw new Error('Arquivo inválido: sem "version".');
  if (data.version > STATE_VERSION) throw new Error('Arquivo gerado por uma versão mais nova do painel.');
  for (const k of LISTS) if (!Array.isArray(data[k])) throw new Error(`Arquivo inválido: "${k}" ausente.`);
  if (!data.metrics || typeof data.metrics !== 'object') throw new Error('Arquivo inválido: "metrics" ausente.');
  if (data.records !== undefined && !Array.isArray(data.records)) throw new Error('Arquivo inválido: "records" deve ser uma lista.');
  return migrate(data);
}

function migrate(data) {
  data.records ||= [];
  if (data.version < 2) {
    const seed = new Map(SEED_STAGES.map((s) => [s.id, s]));
    let maxY = Math.max(...SEED_STAGES.map((s) => s.y));
    for (const st of data.stages) {
      const base = seed.get(st.id);
      if (base) { st.x = base.x; st.y = base.y; } else { maxY += ROW; st.x = 40; st.y = maxY; }
    }
    data.version = 2;
  }
  if (data.version < 3) {
    for (const e of data.edges) if (e.from === 's11' && e.to === 's5') e.loop = true;
    data.version = 3;
  }
  return data;
}

export function createStore({ storage = null, now = () => new Date() } = {}) {
  let state;
  const listeners = new Set();
  const read = (key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const write = (key, val) => { try { storage?.setItem(key, val); return true; } catch { return false; } };

  try { state = validateState(JSON.parse(read(STORAGE_KEY))); } catch { state = createInitialState(); }

  const commit = (text, stageId = null) => {
    if (text) {
      state.history.unshift({ id: uid('h'), at: now().toISOString(), text, stageId });
      state.history.length = Math.min(state.history.length, MAX_HISTORY);
    }
    write(STORAGE_KEY, JSON.stringify(state));
    listeners.forEach((fn) => fn(state));
  };
  const find = (list, id) => state[list].find((x) => x.id === id);

  const api = {
    get: () => state,
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),

    // Tarefas
    addTask(d) {
      const t = { id: uid('t'), stageId: null, title: '', description: '', ownerId: null, frequency: '', priority: 'Média', due: '', status: 'Pendente', notes: '', expected: '', ...d };
      if (!t.title.trim()) throw new Error('A tarefa precisa de um título.');
      state.tasks.push(t); commit(`Tarefa criada: ${t.title}`, t.stageId); return t;
    },
    updateTask(id, patch) {
      const t = find('tasks', id); if (!t) return;
      if ('title' in patch && !patch.title.trim()) throw new Error('A tarefa precisa de um título.');
      const statusChanged = patch.status && patch.status !== t.status;
      Object.assign(t, patch);
      commit(statusChanged ? `Tarefa "${t.title}" → ${t.status}` : `Tarefa editada: ${t.title}`, t.stageId);
    },
    completeTask(id) {
      const t = find('tasks', id); if (!t || t.status === 'Concluída') return;
      t.status = 'Concluída'; t.completedAt = now().toISOString(); commit(`Tarefa concluída: ${t.title}`, t.stageId);
    },
    reopenTask(id) {
      const t = find('tasks', id); if (!t || t.status !== 'Concluída') return;
      t.status = 'Pendente'; t.completedAt = ''; commit(`Tarefa reaberta: ${t.title}`, t.stageId);
    },
    deleteTask(id) {
      const t = find('tasks', id); if (!t) return;
      state.tasks = state.tasks.filter((x) => x.id !== id); commit(`Tarefa removida: ${t.title}`, t.stageId);
    },

    // Etapas
    updateStage(id, patch) {
      const s = find('stages', id); if (!s) return;
      if ('name' in patch && !patch.name.trim()) throw new Error('A etapa precisa de um nome.');
      Object.assign(s, patch); commit(`Etapa editada: ${s.name}`, id);
    },
    setNext(id, nextIds) {
      state.edges = state.edges.filter((e) => e.from !== id);
      nextIds.filter((n) => n !== id && find('stages', n)).forEach((to) => state.edges.push({ from: id, to }));
      commit(`Ligações da etapa atualizadas: ${find('stages', id)?.name}`, id);
    },
    addStage(d) {
      if (!d.name?.trim()) throw new Error('A etapa precisa de um nome.');
      const maxY = Math.max(...state.stages.map((s) => s.y), 0);
      const s = { id: uid('s'), kind: 'stage', num: null, sector: 'Operação', x: 40, y: maxY + 190, objective: '', activities: [], inputs: [], outputs: [], kpis: [], responsibilities: [], problems: [], ownerId: null, substituteId: null, notes: '', ...d };
      state.stages.push(s); commit(`Etapa criada: ${s.name}`, s.id); return s;
    },
    deleteStage(id) {
      const s = find('stages', id); if (!s) return;
      if (state.tasks.some((t) => t.stageId === id)) throw new Error('Remova ou mova as tarefas da etapa antes de excluí-la.');
      state.stages = state.stages.filter((x) => x.id !== id);
      state.edges = state.edges.filter((e) => e.from !== id && e.to !== id);
      state.paths.forEach((p) => p.steps.forEach((st) => { if (st.stageId === id) st.stageId = null; }));
      state.employees.forEach((e) => { e.stageIds = (e.stageIds || []).filter((x) => x !== id); });
      state.records.forEach((r) => { if (r.stageId === id) r.stageId = null; });
      state.improvements.forEach((i) => { if (i.link?.id === id) i.link = null; });
      commit(`Etapa removida: ${s.name}`);
    },

    // Funcionários — um cadastro só, vinculado a várias etapas via stageIds.
    addEmployee(d) {
      if (!d.name?.trim()) throw new Error('O funcionário precisa de um nome.');
      const e = { id: uid('e'), name: '', role: '', sector: '', responsibilities: '', recurringTasks: '', stageIds: [], coordinatorId: null, substituteId: null, kpis: '', training: '', ...d };
      state.employees.push(e); commit(`Funcionário cadastrado: ${e.name}`); return e;
    },
    updateEmployee(id, patch) {
      const e = find('employees', id); if (!e) return;
      if ('name' in patch && !patch.name.trim()) throw new Error('O funcionário precisa de um nome.');
      Object.assign(e, patch);
      if (e.coordinatorId === e.id) e.coordinatorId = null;
      commit(`Funcionário editado: ${e.name}`);
    },
    // Vincular = "participa da etapa". NÃO define responsável principal (isso é sempre escolha explícita).
    linkEmployee(employeeId, stageId, linked = true) {
      const e = find('employees', employeeId), st = find('stages', stageId); if (!e || !st) return;
      const set = new Set(e.stageIds || []); linked ? set.add(stageId) : set.delete(stageId);
      e.stageIds = [...set]; commit(`${e.name} ${linked ? 'vinculado(a) à' : 'desvinculado(a) da'} etapa ${st.name}`, stageId);
    },
    deleteEmployee(id) {
      const e = find('employees', id); if (!e) return;
      state.employees = state.employees.filter((x) => x.id !== id);
      state.employees.forEach((x) => { if (x.coordinatorId === id) x.coordinatorId = null; if (x.substituteId === id) x.substituteId = null; });
      state.stages.forEach((s) => { if (s.ownerId === id) s.ownerId = null; if (s.substituteId === id) s.substituteId = null; });
      state.tasks.forEach((t) => { if (t.ownerId === id) t.ownerId = null; });
      state.records.forEach((r) => { if (r.ownerId === id) r.ownerId = null; });
      state.improvements.forEach((i) => {
        if (i.reviewerId === id) i.reviewerId = null;
        if (i.link?.id === id) i.link = null;
      });
      commit(`Funcionário removido: ${e.name} (responsabilidades voltaram para "A definir")`);
    },

    // Registros operacionais (orçamento, locação, entrega...) — base dos indicadores. Sem valores financeiros.
    addRecord(d) {
      const r = { id: uid('r'), kind: 'Orçamento', title: '', status: 'Aberto', date: '', stageId: null, ownerId: null, notes: '', ...d };
      if (!r.title.trim()) throw new Error('O registro precisa de uma identificação.');
      state.records.push(r); commit(`Registro criado: ${r.kind} — ${r.title}`, r.stageId); return r;
    },
    updateRecord(id, patch) {
      const r = find('records', id); if (!r) return;
      if ('title' in patch && !patch.title.trim()) throw new Error('O registro precisa de uma identificação.');
      Object.assign(r, patch); commit(`Registro editado: ${r.kind} — ${r.title}`, r.stageId);
    },
    deleteRecord(id) {
      const r = find('records', id); if (!r) return;
      state.records = state.records.filter((x) => x.id !== id); commit(`Registro removido: ${r.kind} — ${r.title}`, r.stageId);
    },

    // Melhorias
    addImprovement(d) {
      if (!d.title?.trim()) throw new Error('A sugestão precisa de um título.');
      const i = { id: uid('i'), title: '', problem: '', idea: '', benefit: '', sector: '', reviewerId: null, cost: '', impact: 'Médio', difficulty: 'Médio', status: 'Nova', nextAction: '', link: null, ...d };
      state.improvements.push(i); commit(`Sugestão criada: ${i.title}`, i.link?.type === 'stage' ? i.link.id : null); return i;
    },
    updateImprovement(id, patch) {
      const i = find('improvements', id); if (!i) return;
      if ('title' in patch && !patch.title.trim()) throw new Error('A sugestão precisa de um título.');
      Object.assign(i, patch); commit(`Sugestão editada: ${i.title}`);
    },
    deleteImprovement(id) {
      const i = find('improvements', id); if (!i) return;
      state.improvements = state.improvements.filter((x) => x.id !== id); commit(`Sugestão removida: ${i.title}`);
    },

    setMetric(key, value) {
      if (value === null || value === '' || value === undefined) delete state.metrics[key];
      else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new Error('Informe um número maior ou igual a zero.');
        state.metrics[key] = n;
      }
      commit(`Indicador atualizado: ${METRIC_DEFS.find((d) => d.key === key)?.label ?? key}`);
    },

    // Backup / restauração. Importar e reiniciar guardam antes uma cópia do estado atual.
    exportJSON: () => JSON.stringify(state, null, 2),
    importJSON(text) {
      const next = validateState(JSON.parse(text));
      write(BACKUP_KEY, JSON.stringify(state));
      state = next; commit('Dados importados de arquivo');
    },
    reset() {
      write(BACKUP_KEY, JSON.stringify(state));
      state = createInitialState(); commit('Painel reiniciado com os dados iniciais');
    },
    hasBackup: () => Boolean(read(BACKUP_KEY)),
    restoreBackup() {
      const raw = read(BACKUP_KEY); if (!raw) throw new Error('Não há cópia de segurança.');
      state = validateState(JSON.parse(raw)); commit('Cópia de segurança restaurada');
    },
  };
  return api;
}
