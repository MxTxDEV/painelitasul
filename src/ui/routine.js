// "Rotina diária": tarefas de cada funcionário por dia, com filtros pendentes/concluídas/atrasadas/bloqueadas.
import { el, fmtDate } from './dom.js';
import { taskRow, taskForm } from './tasks.js';
import { routineItems, ROUTINE_GROUPS, todayISO, personName } from '../state/logic.js';

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function renderRoutine(host, { store, routine, onChange, onOpenStage }) {
  const s = store.get();
  const items = routineItems(s, routine);
  const total = items.day.length + items.carried.length + items.undated.length;
  const list = (title, tasks, testid, empty) => el('section', {}, el('h3', { text: `${title} (${tasks.length})` }),
    tasks.length ? el('ul', { class: 'tasks', 'data-testid': testid }, tasks.map((t) => taskRow(store, t, { showStage: true, onOpenStage }))) : el('p', { class: 'muted', text: empty }));
  const who = routine.person === '__none' ? 'sem responsável (A definir)' : routine.person ? personName(s, routine.person) : 'todos os funcionários';
  const presetOwner = routine.person && routine.person !== '__none' ? routine.person : null;

  host.replaceChildren(
    el('div', { class: 'view-head' },
      el('div', {}, el('h2', { text: 'Rotina diária' }),
        el('p', { class: 'muted', text: 'Consulte as tarefas de cada funcionário por dia. Tarefas só aparecem aqui se tiverem responsável e prazo cadastrados — nada é atribuído automaticamente.' })),
      el('button', { class: 'btn primary', type: 'button', 'data-testid': 'routine-new-task', text: '+ Nova tarefa', onClick: () => taskForm(store, null, null, { ...(presetOwner ? { ownerId: presetOwner } : {}), due: routine.day }) })),
    el('div', { class: 'toolbar routine-bar' },
      el('div', { class: 'filters' },
        el('label', { class: 'filter' }, el('span', { text: 'Funcionário' }),
          el('select', { 'data-testid': 'routine-person', onChange: (e) => onChange({ person: e.target.value }) },
            [{ value: '', label: 'Todos' }, { value: '__none', label: 'A definir (sem responsável)' }, ...s.employees.map((e) => ({ value: e.id, label: e.name }))]
              .map((o) => el('option', { value: o.value, text: o.label, selected: o.value === routine.person })))),
        el('div', { class: 'daynav' },
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Dia anterior', 'data-testid': 'day-prev', text: '‹', onClick: () => onChange({ day: addDays(routine.day, -1) }) }),
          el('input', { type: 'date', 'data-testid': 'routine-day', 'aria-label': 'Dia', value: routine.day, onChange: (e) => e.target.value && onChange({ day: e.target.value }) }),
          el('button', { class: 'btn small', type: 'button', 'aria-label': 'Próximo dia', 'data-testid': 'day-next', text: '›', onClick: () => onChange({ day: addDays(routine.day, 1) }) }),
          el('button', { class: 'btn small', type: 'button', text: 'Hoje', onClick: () => onChange({ day: todayISO() }) }))),
      el('div', { class: 'groups', role: 'group', 'aria-label': 'Filtros de situação' }, ROUTINE_GROUPS.map(([id, label]) => {
        const on = routine.groups.includes(id);
        return el('button', { type: 'button', class: `seg${on ? ' active' : ''}`, 'data-group': id, 'aria-pressed': String(on), text: label,
          onClick: () => onChange({ groups: on ? routine.groups.filter((g) => g !== id) : [...routine.groups, id] }) });
      }))),
    el('p', { class: 'muted', 'data-testid': 'routine-summary', text: `${fmtDate(routine.day)} · ${who} · ${total} tarefa(s)${routine.groups.length ? ' com os filtros selecionados' : ''}` }),
    !s.tasks.length ? el('p', { class: 'empty', text: 'Nenhuma tarefa cadastrada. Use "+ Nova tarefa" ou cadastre pela etapa.' }) : null,
    list(`Com prazo em ${fmtDate(routine.day)}`, items.day, 'routine-day-list', 'Nenhuma tarefa com prazo neste dia.'),
    list('Atrasadas em relação a este dia (ainda abertas)', items.carried, 'routine-carried-list', 'Nenhuma tarefa anterior em aberto.'),
    list('Sem prazo definido', items.undated, 'routine-undated-list', 'Nenhuma tarefa sem prazo.'));
}
