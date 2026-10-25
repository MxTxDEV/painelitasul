// Componentes reutilizáveis de tarefa: formulário e linha (usados no painel, na Equipe e na Rotina).
import { el, fmtDate, confirmDialog } from './dom.js';
import { openForm, options } from './form.js';
import { STATUSES, PRIORITIES } from '../data/seed.js';
import { byId, personName, isOverdue } from '../state/logic.js';

export const STATUS_ICON = { Pendente: '○', 'Em andamento': '◐', 'Aguardando terceiros': '⏳', Bloqueada: '⛔', Concluída: '✔' };
export const FREQUENCIES = ['Diária', 'Semanal', 'Mensal', 'A cada locação', 'Sob demanda'];

// stage pode ser null (o usuário escolhe a etapa no formulário). preset: valores iniciais (ex.: ownerId).
export function taskForm(store, stage, task, preset = {}) {
  const s = store.get();
  const freq = [...FREQUENCIES, ...(task?.frequency && !FREQUENCIES.includes(task.frequency) ? [task.frequency] : [])];
  openForm({
    title: task ? 'Editar tarefa' : stage ? `Nova tarefa — ${stage.name}` : 'Nova tarefa',
    values: task || { status: 'Pendente', priority: 'Média', stageId: stage?.id || '', ...preset },
    fields: [
      { name: 'title', label: 'Título', required: true },
      { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'stageId', label: 'Etapa relacionada', type: 'select', required: true, options: options(s.stages.map((x) => ({ value: x.id, label: x.name })), { blank: 'Selecione a etapa' }) },
      { name: 'ownerId', label: 'Responsável', type: 'select', options: options(s.employees.map((e) => ({ value: e.id, label: e.name })), { blank: 'A definir' }) },
      { name: 'frequency', label: 'Frequência', type: 'select', options: options(freq, { blank: 'Sem frequência (pontual)' }) },
      { name: 'priority', label: 'Prioridade', type: 'select', options: options(PRIORITIES) },
      { name: 'due', label: 'Prazo', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: options(STATUSES) },
      { name: 'expected', label: 'Resultado esperado', type: 'textarea', rows: 2 },
      { name: 'notes', label: 'Observações', type: 'textarea', rows: 2 },
    ],
    onSubmit: (v) => {
      const data = { ...v, ownerId: v.ownerId || null };
      if (task) store.updateTask(task.id, data); else store.addTask(data);
    },
    onDelete: task ? async () => { if (await confirmDialog('Excluir esta tarefa?')) { store.deleteTask(task.id); return true; } return false; } : null,
  });
}

// Linha de tarefa. opts.showStage: mostra a etapa (útil fora do painel da etapa).
export function taskRow(store, t, { showStage = false, onOpenStage } = {}) {
  const s = store.get();
  const late = isOverdue(t), done = t.status === 'Concluída';
  const stage = byId(s.stages, t.stageId);
  return el('li', { class: `task${late ? ' late' : ''}${t.status === 'Bloqueada' ? ' blocked' : ''}${done ? ' done' : ''}`, 'data-testid': 'task-row', 'data-task': t.id },
    el('div', { class: 'task-main' },
      el('strong', { text: t.title }),
      el('span', { class: `pill st-${t.status.replace(/\s/g, '')}`, text: `${STATUS_ICON[t.status] || ''} ${t.status}` }),
      el('span', { class: 'pill pr', text: t.priority }),
      late && el('span', { class: 'pill late', text: '⚠ ATRASADA' })),
    el('small', { class: 'muted', text: `Responsável: ${personName(s, t.ownerId)}${t.due ? ` · Prazo: ${fmtDate(t.due)}` : ' · Sem prazo'}${t.frequency ? ` · ${t.frequency}` : ''}${done && t.completedAt ? ` · Concluída em ${fmtDate(t.completedAt.slice(0, 10))}` : ''}` }),
    showStage && stage && el('small', {}, 'Etapa: ', onOpenStage ? el('button', { class: 'chip link', type: 'button', text: stage.name, onClick: () => onOpenStage(stage.id) }) : stage.name),
    t.description && el('p', { text: t.description }),
    t.expected && el('small', { text: `Resultado esperado: ${t.expected}` }),
    t.notes && el('small', { class: 'muted', text: `Obs.: ${t.notes}` }),
    el('div', { class: 'row-actions' },
      el('button', { class: 'btn small', type: 'button', 'data-act': 'edit', text: 'Editar', onClick: () => taskForm(store, stage, t) }),
      done ? el('button', { class: 'btn small', type: 'button', 'data-act': 'reopen', text: 'Reabrir', onClick: () => store.reopenTask(t.id) })
        : el('button', { class: 'btn small', type: 'button', 'data-act': 'complete', text: 'Concluir', onClick: () => store.completeTask(t.id) })));
}
