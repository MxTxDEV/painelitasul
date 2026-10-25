// Visão "Equipe e Responsabilidades". Nenhuma hierarquia é pré-cadastrada: só o que o usuário informar.
import { el, confirmDialog } from './dom.js';
import { openForm, options } from './form.js';
import { SECTORS } from '../data/seed.js';
import { byId, personName, stagesOf } from '../state/logic.js';

export function employeeForm(store, emp) {
  const s = store.get();
  const others = s.employees.filter((e) => e.id !== emp?.id).map((e) => ({ value: e.id, label: e.name }));
  openForm({
    title: emp ? 'Editar funcionário' : 'Novo funcionário', values: emp || {},
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

function card(store, e, onOpenStage) {
  const s = store.get();
  const stages = stagesOf(s, e.id);
  const field = (label, v) => v && el('p', { class: 'kv' }, el('strong', { text: `${label}: ` }), v);
  return el('article', { class: 'emp', 'data-testid': 'emp-card' },
    el('header', {}, el('h4', { text: e.name }), el('button', { class: 'btn small', type: 'button', text: 'Editar', onClick: () => employeeForm(store, e) })),
    el('p', { class: 'muted', text: `${e.role || 'Cargo: A definir'} · ${e.sector || 'Setor: A definir'}` }),
    field('Responsabilidades', e.responsibilities), field('Tarefas recorrentes', e.recurringTasks),
    el('p', { class: 'kv' }, el('strong', { text: 'Etapas: ' }), stages.length ? stages.map((st) => el('button', { class: 'chip link', type: 'button', text: st.num ? `${st.num}. ${st.name}` : st.name, onClick: () => onOpenStage(st.id) })) : 'nenhuma'),
    field('Substituto', e.substituteId ? personName(s, e.substituteId) : ''), field('Responde por', e.kpis), field('Treinamento', e.training));
}

function tree(store, parentId, seen, onOpenStage) {
  const s = store.get();
  const kids = s.employees.filter((e) => (e.coordinatorId || null) === parentId && !seen.has(e.id));
  return kids.length ? el('ul', { class: 'org' }, kids.map((e) => { seen.add(e.id); return el('li', {}, card(store, e, onOpenStage), tree(store, e.id, seen, onOpenStage)); })) : null;
}

export function renderTeam(host, { store, onOpenStage }) {
  const s = store.get();
  host.replaceChildren(
    el('div', { class: 'view-head' },
      el('div', {}, el('h2', { text: 'Equipe e Responsabilidades' }),
        el('p', { class: 'muted', text: 'A hierarquia abaixo reflete apenas as relações de coordenação que você cadastrar. Nada foi presumido.' })),
      el('button', { class: 'btn primary', type: 'button', 'data-testid': 'add-employee', text: '+ Funcionário', onClick: () => employeeForm(store) })),
    el('section', {}, el('h3', { text: 'Hierarquia funcional' }),
      s.employees.length ? [tree(store, null, new Set(), onOpenStage), el('p', { class: 'muted small', text: 'Quem não tem coordenador definido aparece no topo.' })]
        : el('p', { class: 'empty', text: 'Nenhum funcionário cadastrado. Use "+ Funcionário" para começar.' })),
    el('section', {}, el('h3', { text: 'Cobertura de responsabilidades por etapa' }),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Etapa', 'Setor', 'Responsável', 'Substituto', 'Pessoas envolvidas'].map((h) => el('th', { text: h })))),
        el('tbody', {}, s.stages.map((st) => el('tr', { 'data-testid': 'coverage-row' },
          el('td', {}, el('button', { class: 'chip link', type: 'button', text: `${st.num ?? 'R'}. ${st.name}`, onClick: () => onOpenStage(st.id) })),
          el('td', { text: st.sector }),
          el('td', { class: st.ownerId ? '' : 'undef', text: st.ownerId ? personName(s, st.ownerId) : '⚠ A definir' }),
          el('td', { class: st.substituteId ? '' : 'undef', text: st.substituteId ? personName(s, st.substituteId) : 'A definir' }),
          el('td', { text: s.employees.filter((e) => stagesOf(s, e.id).some((x) => x.id === st.id)).map((e) => e.name).join(', ') || '—' }))))))));
}
