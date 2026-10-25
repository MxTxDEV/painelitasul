// Visão "Equipe e Responsabilidades". Nenhuma hierarquia é pré-cadastrada: só o que o usuário informar.
import { el, render, confirmDialog } from './dom.js';
import { openForm, options } from './form.js';
import { SECTORS } from '../data/seed.js';
import { byId, personName, stagesOf, employeeTasks, employeeRoles, isOverdue, handoffList } from '../state/logic.js';
import { taskRow, taskForm } from './tasks.js';

export function employeeForm(store, emp, preset = {}) {
  const s = store.get();
  const others = s.employees.filter((e) => e.id !== emp?.id).map((e) => ({ value: e.id, label: e.name }));
  openForm({
    title: emp ? 'Editar funcionário' : 'Novo funcionário', values: emp || preset,
    fields: [
      { name: 'name', label: 'Funcionário', required: true },
      { name: 'role', label: 'Cargo ou função' },
      { name: 'sector', label: 'Setor', type: 'select', options: options(SECTORS, { blank: 'A definir' }) },
      { name: 'responsibilities', label: 'Responsabilidades', type: 'textarea' },
      { name: 'recurringTasks', label: 'Tarefas recorrentes', type: 'textarea', rows: 2 },
      { name: 'stageIds', label: 'Processos / etapas em que participa', type: 'checks', options: s.stages.map((x) => ({ value: x.id, label: x.name })) },
      { name: 'coordinatorId', label: 'Quem coordena a atividade', type: 'select', options: options(others, { blank: 'A definir' }) },
      { name: 'substituteId', label: 'Quem substitui este responsável', type: 'select', options: options(others, { blank: 'A definir' }) },
      { name: 'kpis', label: 'Indicadores pelos quais responde', type: 'textarea', rows: 2 },
      { name: 'training', label: 'Necessidades de treinamento', type: 'textarea', rows: 2 },
    ],
    onSubmit: (v) => {
      const d = { ...v, coordinatorId: v.coordinatorId || null, substituteId: v.substituteId || null };
      if (emp) store.updateEmployee(emp.id, d); else store.addEmployee(d);
    },
    onDelete: emp ? async () => {
      if (!(await confirmDialog(`Excluir ${emp.name}? As etapas e tarefas dele voltarão para "A definir".`))) return false;
      store.deleteEmployee(emp.id); return true;
    } : null,
  });
}

function card(store, e, { onOpenStage, onOpenRoutine }) {
  const s = store.get();
  const tasks = employeeTasks(s, e.id);
  const open = tasks.filter((t) => t.status !== 'Concluída'), late = tasks.filter((t) => isOverdue(t)), blocked = tasks.filter((t) => t.status === 'Bloqueada');
  const roles = employeeRoles(s, e.id);
  const field = (label, v) => v && el('p', { class: 'kv' }, el('strong', { text: `${label}: ` }), v);
  return el('article', { class: 'emp', 'data-testid': 'emp-card', 'data-emp': e.id },
    el('header', {}, el('h4', { text: e.name }), el('button', { class: 'btn small', type: 'button', text: 'Editar', onClick: () => employeeForm(store, e) })),
    el('p', { class: 'kv' }, el('strong', { text: 'Cargo: ' }), e.role ? e.role : el('span', { class: 'undef', text: 'A definir' }), ' · ', el('strong', { text: 'Setor: ' }), e.sector ? e.sector : el('span', { class: 'undef', text: 'A definir' })),
    field('Responsabilidades', e.responsibilities), field('Tarefas recorrentes', e.recurringTasks),
    el('p', { class: 'kv' }, el('strong', { text: 'Papel nos processos: ' }), roles.length ? roles.map((r) =>
      el('button', { class: 'chip link', type: 'button', title: r.roles.join(', '), text: `${r.stage.num ? `${r.stage.num}. ` : ''}${r.stage.name} — ${r.roles.join(' + ')}`, onClick: () => onOpenStage(r.stage.id) })) : el('span', { class: 'undef', text: 'A definir (nenhuma etapa vinculada)' })),
    el('p', { class: 'kv', 'data-testid': 'emp-counts' }, el('strong', { text: 'Tarefas: ' }), tasks.length
      ? `${tasks.length} atribuída(s) · ${open.length} pendente(s) · ${late.length} atrasada(s) · ${blocked.length} bloqueada(s)` : 'nenhuma atribuída'),
    tasks.length ? el('details', { class: 'edit' }, el('summary', { text: `Ver tarefas atribuídas (${tasks.length})` }),
      el('ul', { class: 'tasks' }, tasks.map((t) => taskRow(store, t, { showStage: true, onOpenStage })))) : null,
    field('Substituto', e.substituteId ? personName(s, e.substituteId) : ''), field('Responde por', e.kpis), field('Treinamento', e.training),
    el('div', { class: 'row-actions' },
      el('button', { class: 'btn small', type: 'button', 'data-act': 'new-task', text: '+ Tarefa', onClick: () => taskForm(store, null, null, { ownerId: e.id }) }),
      el('button', { class: 'btn small', type: 'button', 'data-act': 'routine', text: 'Ver rotina', onClick: () => onOpenRoutine(e.id) })));
}

function tree(store, parentId, seen, ctx) {
  const s = store.get();
  const kids = s.employees.filter((e) => (e.coordinatorId || null) === parentId && !seen.has(e.id));
  return kids.length ? el('ul', { class: 'org' }, kids.map((e) => { seen.add(e.id); return el('li', {}, card(store, e, ctx), tree(store, e.id, seen, ctx)); })) : null;
}

export function renderTeam(host, { store, onOpenStage, onOpenRoutine }) {
  const s = store.get();
  const ctx = { onOpenStage, onOpenRoutine };
  const orphan = s.tasks.filter((t) => !t.ownerId && t.status !== 'Concluída');
  const hand = handoffList(s);
  render(host,
    el('div', { class: 'view-head' },
      el('div', {}, el('h2', { text: 'Equipe e Responsabilidades' }),
        el('p', { class: 'muted', text: 'A hierarquia abaixo reflete apenas as relações de coordenação que você cadastrar. Nada foi presumido.' })),
      el('button', { class: 'btn primary', type: 'button', 'data-testid': 'add-employee', text: '+ Funcionário', onClick: () => employeeForm(store) })),
    el('section', {}, el('h3', { text: 'Hierarquia funcional' }),
      s.employees.length ? [tree(store, null, new Set(), ctx), el('p', { class: 'muted small', text: 'Quem não tem coordenador definido aparece no topo.' })]
        : el('p', { class: 'empty', text: 'Nenhum funcionário cadastrado. Use "+ Funcionário" para começar.' })),
    el('section', {}, el('h3', { text: 'Cobertura de responsabilidades por etapa' }),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Etapa', 'Setor', 'Responsável', 'Substituto', 'Pessoas envolvidas'].map((h) => el('th', { text: h })))),
        el('tbody', {}, s.stages.map((st) => el('tr', { 'data-testid': 'coverage-row' },
          el('td', {}, el('button', { class: 'chip link', type: 'button', text: `${st.num ?? 'R'}. ${st.name}`, onClick: () => onOpenStage(st.id) })),
          el('td', { text: st.sector }),
          el('td', { class: st.ownerId ? '' : 'undef', text: st.ownerId ? personName(s, st.ownerId) : '⚠ A definir' }),
          el('td', { class: st.substituteId ? '' : 'undef', text: st.substituteId ? personName(s, st.substituteId) : 'A definir' }),
          el('td', { text: s.employees.filter((e) => stagesOf(s, e.id).some((x) => x.id === st.id)).map((e) => e.name).join(', ') || '—' }))))))),
    el('section', {}, el('h3', { text: 'Tarefas pendentes sem responsável (A definir)' }),
      orphan.length ? el('ul', { class: 'tasks', 'data-testid': 'orphan-tasks' }, orphan.map((t) => taskRow(store, t, { showStage: true, onOpenStage }))) : el('p', { class: 'muted', text: s.tasks.length ? 'Todas as tarefas abertas têm responsável.' : 'Nenhuma tarefa cadastrada.' })),
    el('section', {}, el('h3', { text: 'Transferências de responsabilidade entre setores' }),
      el('div', { class: 'table-wrap' }, el('table', { 'data-testid': 'handoff-table' },
        el('thead', {}, el('tr', {}, ['De (setor · responsável)', 'Para (setor · responsável)', 'Entrega exigida', 'Situação da etapa de origem'].map((h) => el('th', { text: h })))),
        el('tbody', {}, hand.map((h) => el('tr', { 'data-testid': 'handoff-row', class: h.waiting ? 'waiting' : '' },
          el('td', {}, el('button', { class: 'chip link', type: 'button', text: h.from.name, onClick: () => onOpenStage(h.from.id) }), ` ${h.from.sector} · ${personName(s, h.from.ownerId)}`),
          el('td', {}, el('button', { class: 'chip link', type: 'button', text: h.to.name, onClick: () => onOpenStage(h.to.id) }), ` ${h.to.sector} · ${personName(s, h.to.ownerId)}`),
          el('td', { text: h.from.outputs.join('; ') || 'A definir' }),
          el('td', { text: h.progress.state === 'concluida' ? '✔ concluída' : h.progress.state === 'em-aberto' ? `⏳ ${h.progress.open} tarefa(s) em aberto${h.waiting ? ' — destino aguardando' : ''}` : '○ sem tarefas cadastradas' }))))))));
}
