// Painel lateral de detalhes de uma etapa (abas).
import { el, fmtDate, fmtDateTime, confirmDialog, toast } from './dom.js';
import { openForm, options } from './form.js';
import { SECTORS, STATUSES, PRIORITIES } from '../data/seed.js';
import { byId, personName, stageTasks, isOverdue, neighbours, participants, stageIssues } from '../state/logic.js';

export const TABS = [
  ['resumo', 'Resumo'], ['resp', 'Responsabilidades'], ['tarefas', 'Tarefas'], ['pessoas', 'Responsáveis'],
  ['fluxo', 'Entradas e entregas'], ['kpis', 'Indicadores'], ['problemas', 'Problemas'], ['ideias', 'Melhorias'], ['hist', 'Histórico'],
];

const lines = (txt) => txt.split('\n').map((s) => s.trim()).filter(Boolean);
const bullets = (arr, empty) => (arr.length ? el('ul', { class: 'list' }, arr.map((x) => el('li', { text: x }))) : el('p', { class: 'muted', text: empty }));

export function taskForm(store, stage, task) {
  const s = store.get();
  openForm({
    title: task ? 'Editar tarefa' : `Nova tarefa — ${stage.name}`, values: task || { status: 'Pendente', priority: 'Média' },
    fields: [
      { name: 'title', label: 'Título', required: true },
      { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'ownerId', label: 'Responsável', type: 'select', options: options(s.employees.map((e) => ({ value: e.id, label: e.name })), { blank: 'A definir' }) },
      { name: 'frequency', label: 'Frequência (se aplicável)', hint: 'Ex.: diária, semanal, a cada locação' },
      { name: 'priority', label: 'Prioridade', type: 'select', options: options(PRIORITIES) },
      { name: 'due', label: 'Prazo', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: options(STATUSES) },
      { name: 'expected', label: 'Resultado esperado', type: 'textarea', rows: 2 },
      { name: 'notes', label: 'Observações', type: 'textarea', rows: 2 },
    ],
    onSubmit: (v) => {
      const data = { ...v, ownerId: v.ownerId || null };
      if (task) store.updateTask(task.id, data); else store.addTask({ ...data, stageId: stage.id });
    },
    onDelete: task ? async () => { if (await confirmDialog('Excluir esta tarefa?')) { store.deleteTask(task.id); return true; } return false; } : null,
  });
}

export function stageForm(store, stage, { onDeleted } = {}) {
  const s = store.get();
  const nextIds = s.edges.filter((e) => e.from === stage?.id).map((e) => e.to);
  openForm({
    title: stage ? 'Editar etapa' : 'Nova etapa',
    values: stage ? { ...stage, next: nextIds, activities: stage.activities.join('\n'), inputs: stage.inputs.join('\n'), outputs: stage.outputs.join('\n'), kpis: stage.kpis.join('\n') } : { sector: 'Operação' },
    fields: [
      { name: 'name', label: 'Nome da etapa', required: true },
      { name: 'sector', label: 'Setor', type: 'select', options: options(SECTORS) },
      { name: 'objective', label: 'Objetivo / resumo da função', type: 'textarea' },
      { name: 'activities', label: 'Atividades (uma por linha)', type: 'textarea', rows: 5 },
      { name: 'inputs', label: 'Entradas recebidas (uma por linha)', type: 'textarea', rows: 3 },
      { name: 'outputs', label: 'Entregas para o próximo setor (uma por linha)', type: 'textarea', rows: 3 },
      { name: 'kpis', label: 'Indicadores de desempenho (um por linha)', type: 'textarea', rows: 3 },
      { name: 'next', label: 'Segue para', type: 'checks', options: s.stages.filter((x) => x.id !== stage?.id).map((x) => ({ value: x.id, label: x.name })) },
    ],
    onSubmit: (v) => {
      const data = { name: v.name, sector: v.sector, objective: v.objective, activities: lines(v.activities), inputs: lines(v.inputs), outputs: lines(v.outputs), kpis: lines(v.kpis) };
      const saved = stage ? (store.updateStage(stage.id, data), stage) : store.addStage(data);
      store.setNext(saved.id, v.next);
    },
    onDelete: stage ? async () => {
      if (!(await confirmDialog(`Excluir a etapa "${stage.name}"?`))) return false;
      store.deleteStage(stage.id); onDeleted?.(); return true;
    } : null,
  });
}

function textBlock(store, stage, field, label, empty) {
  const ta = el('textarea', { rows: 6, value: stage[field].join('\n'), 'aria-label': label });
  return el('div', {},
    stage[field].length ? bullets(stage[field], empty) : el('p', { class: 'muted', text: empty }),
    el('details', { class: 'edit' }, el('summary', { text: 'Editar' }), ta,
      el('button', { class: 'btn small primary', type: 'button', text: 'Salvar', onClick: () => { store.updateStage(stage.id, { [field]: lines(ta.value) }); toast('Salvo'); } }),
      el('small', { class: 'muted', text: ' Uma linha por item.' })));
}

export function renderPanel(host, { store, stageId, tab, onTab, onClose, onEditStage, onNewTask }) {
  host.replaceChildren();
  const s = store.get(), stage = byId(s.stages, stageId);
  if (!stage) { host.hidden = true; return; }
  host.hidden = false;
  const nb = neighbours(s, stage.id), iss = stageIssues(s, stage);
  const personSel = (field, label) => el('label', { class: 'field' }, el('span', { class: 'lbl', text: label }),
    el('select', { 'data-testid': `sel-${field}`, onChange: (e) => { store.updateStage(stage.id, { [field]: e.target.value || null }); } },
      options(s.employees.map((e) => ({ value: e.id, label: e.name })), { blank: 'A definir' }).map((o) => el('option', { value: o.value, text: o.label, selected: o.value === (stage[field] || '') }))));

  host.append(
    el('header', { class: 'panel-head' },
      el('div', {}, el('small', { class: 'muted', text: stage.num ? `Etapa ${stage.num} · ${stage.sector}` : `Ramal · ${stage.sector}` }), el('h2', { text: stage.name })),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar painel', text: '✕', onClick: onClose })),
    el('div', { class: 'flags' },
      iss.noOwner && el('span', { class: 'flag warn', text: '⚠ Sem responsável definido' }),
      iss.overdue > 0 && el('span', { class: 'flag late', text: `${iss.overdue} tarefa(s) atrasada(s)` }),
      iss.blocked > 0 && el('span', { class: 'flag late', text: `${iss.blocked} bloqueada(s)` })),
    el('nav', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(id === tab), class: `tab${id === tab ? ' active' : ''}`, 'data-tab': id, text: label, onClick: () => onTab(id) }))),
    el('div', { class: 'tab-body', role: 'tabpanel' }, body()));

  function body() {
    switch (tab) {
      case 'resumo': return [
        el('p', { text: stage.objective || 'Sem descrição.' }),
        el('h3', { text: 'Atividades previstas (hipótese inicial)' }), bullets(stage.activities, 'Nenhuma atividade cadastrada.'),
        el('button', { class: 'btn', type: 'button', text: 'Editar etapa', 'data-testid': 'edit-stage', onClick: onEditStage }),
        el('h3', { text: 'Observações' }),
        (() => { const ta = el('textarea', { rows: 3, value: stage.notes, 'aria-label': 'Observações da etapa' });
          return el('div', {}, ta, el('button', { class: 'btn small', type: 'button', text: 'Salvar observação', onClick: () => { store.updateStage(stage.id, { notes: ta.value }); toast('Salvo'); } })); })()];
      case 'resp': return [el('p', { class: 'muted', text: 'Responsabilidades confirmadas da etapa (nada vem preenchido por padrão).' }), textBlock(store, stage, 'responsibilities', 'Responsabilidades', 'Nenhuma responsabilidade definida — A definir.')];
      case 'tarefas': {
        const tasks = stageTasks(s, stage.id);
        return [el('button', { class: 'btn primary', type: 'button', text: '+ Nova tarefa', 'data-testid': 'add-task', onClick: onNewTask }),
          tasks.length ? el('ul', { class: 'tasks' }, tasks.map((t) => {
            const late = isOverdue(t);
            return el('li', { class: `task${late ? ' late' : ''}${t.status === 'Bloqueada' ? ' blocked' : ''}`, 'data-testid': 'task-row' },
              el('div', { class: 'task-main' },
                el('strong', { text: t.title }),
                el('span', { class: `pill st-${t.status.replace(/\s/g, '')}`, text: t.status }),
                el('span', { class: 'pill pr', text: t.priority }),
                late && el('span', { class: 'pill late', text: 'ATRASADA' })),
              el('small', { class: 'muted', text: `Responsável: ${personName(s, t.ownerId)}${t.due ? ` · Prazo: ${fmtDate(t.due)}` : ''}${t.frequency ? ` · ${t.frequency}` : ''}` }),
              t.description && el('p', { text: t.description }),
              t.expected && el('small', { text: `Resultado esperado: ${t.expected}` }),
              t.notes && el('small', { class: 'muted', text: `Obs.: ${t.notes}` }),
              el('div', { class: 'row-actions' },
                el('button', { class: 'btn small', type: 'button', text: 'Editar', onClick: () => taskForm(store, stage, t) }),
                t.status !== 'Concluída' && el('button', { class: 'btn small', type: 'button', text: 'Concluir', onClick: () => store.updateTask(t.id, { status: 'Concluída' }) })));
          })) : el('p', { class: 'muted', text: 'Nenhuma tarefa cadastrada. As atividades previstas na aba Resumo são só uma hipótese inicial.' })];
      }
      case 'pessoas': {
        const ppl = participants(s, stage.id);
        return [personSel('ownerId', 'Responsável principal'), personSel('substituteId', 'Responsável substituto'),
          !s.employees.length && el('p', { class: 'muted', text: 'Nenhum funcionário cadastrado. Cadastre em "Equipe e Responsabilidades".' }),
          el('h3', { text: 'Pessoas envolvidas nesta etapa' }),
          ppl.length ? el('ul', { class: 'list' }, ppl.map((p) => el('li', { text: `${p.name}${p.role ? ` — ${p.role}` : ''}` }))) : el('p', { class: 'muted', text: 'Ninguém vinculado.' })];
      }
      case 'fluxo': return [
        el('h3', { text: 'Entradas recebidas' }), bullets(stage.inputs, 'Não definidas.'),
        el('p', { class: 'muted' }, 'Vem de: ', nb.prev.length ? nb.prev.map((p) => `${p.name} (${p.sector}${p.sector !== stage.sector ? ' — transferência entre setores' : ''})`).join('; ') : 'ninguém (início do fluxo)'),
        el('h3', { text: 'Entregas exigidas para o próximo setor' }), bullets(stage.outputs, 'Não definidas.'),
        el('p', { class: 'muted' }, 'Segue para: ', nb.next.length ? nb.next.map((p) => `${p.name} (${p.sector}${p.sector !== stage.sector ? ' — transferência entre setores' : ''})`).join('; ') : 'fim do fluxo')];
      case 'kpis': return [el('p', { class: 'muted', text: 'Indicadores sugeridos. Valores só aparecem quando houver dados cadastrados.' }), textBlock(store, stage, 'kpis', 'Indicadores', 'Nenhum indicador definido.'), el('p', { text: 'Sem dados registrados' })];
      case 'problemas': return [el('p', { class: 'muted', text: 'Registre problemas recorrentes observados nesta etapa.' }), textBlock(store, stage, 'problems', 'Problemas recorrentes', 'Nenhum problema registrado.')];
      case 'ideias': {
        const list = s.improvements.filter((i) => i.link?.type === 'stage' && i.link.id === stage.id);
        return [list.length ? el('ul', { class: 'list' }, list.map((i) => el('li', { text: `${i.title} — ${i.status}` }))) : el('p', { class: 'muted', text: 'Nenhuma sugestão vinculada a esta etapa.' }),
          el('p', { class: 'muted', text: 'Para cadastrar, use a Central de Melhorias e vincule a esta etapa.' })];
      }
      case 'hist': {
        const h = s.history.filter((x) => x.stageId === stage.id).slice(0, 50);
        return h.length ? el('ul', { class: 'list' }, h.map((x) => el('li', {}, el('small', { class: 'muted', text: fmtDateTime(x.at) }), ' ', x.text))) : el('p', { class: 'muted', text: 'Sem alterações registradas.' });
      }
      default: return null;
    }
  }
}
