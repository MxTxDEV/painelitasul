// Painel lateral de detalhes de uma etapa (abas).
import { el, fmtDate, fmtDateTime, confirmDialog, toast } from './dom.js';
import { openForm, options } from './form.js';
import { SECTORS, STATUSES, PRIORITIES } from '../data/seed.js';
import { byId, personName, stageTasks, isOverdue, neighbours, participants, stageIssues, recordActive, dependencies } from '../state/logic.js';
import { employeeForm } from './team.js';
import { taskForm, taskRow } from './tasks.js';
import { improvementForm } from './improvements.js';

export { taskForm };
export const TABS = [
  ['resumo', 'Visão completa'], ['resp', 'Responsabilidades'], ['tarefas', 'Tarefas'], ['pessoas', 'Responsáveis'],
  ['fluxo', 'Entradas e entregas'], ['kpis', 'Indicadores'], ['problemas', 'Problemas'], ['ideias', 'Melhorias'], ['hist', 'Histórico'],
];

const lines = (txt) => txt.split('\n').map((s) => s.trim()).filter(Boolean);
const bullets = (arr, empty) => (arr.length ? el('ul', { class: 'list' }, arr.map((x) => el('li', { text: x }))) : el('p', { class: 'muted', text: empty }));

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

const sec = (title, ...kids) => el('section', { class: 'psec' }, el('h3', { text: title }), ...kids);

export function renderPanel(host, { store, stageId, tab, onTab, onClose, onEditStage, onNewTask, onOpenStage }) {
  host.replaceChildren();
  const s = store.get(), stage = byId(s.stages, stageId);
  if (!stage) { host.hidden = true; return; }
  host.hidden = false;
  const nb = neighbours(s, stage.id), iss = stageIssues(s, stage);
  const tasks = stageTasks(s, stage.id);

  const personSel = (field, label) => el('label', { class: 'field' }, el('span', { class: 'lbl', text: label }),
    el('select', { 'data-testid': `sel-${field}`, onChange: (e) => { store.updateStage(stage.id, { [field]: e.target.value || null }); } },
      options(s.employees.map((e) => ({ value: e.id, label: e.name })), { blank: 'A definir' }).map((o) => el('option', { value: o.value, text: o.label, selected: o.value === (stage[field] || '') }))));

  const navChips = (list) => (list.length ? list.map((n) => el('button', { type: 'button', class: 'chip link', 'data-nav': n.id, title: n.sector !== stage.sector ? 'Transferência entre setores' : '', text: `${n.num ?? 'R'}. ${n.name}${n.sector !== stage.sector ? ` (${n.sector} ⇄)` : ''}`, onClick: () => onOpenStage(n.id) })) : null);

  const taskList = () => (tasks.length ? el('ul', { class: 'tasks' }, tasks.map((t) => taskRow(store, t))) : el('p', { class: 'muted', text: 'Nenhuma tarefa cadastrada. As atividades previstas são só uma hipótese inicial.' }));

  const nextDue = tasks.filter((t) => t.status !== 'Concluída' && t.due).map((t) => t.due).sort()[0];
  const tasksSection = () => sec('Tarefas e prazos',
    el('p', { class: 'muted', 'data-testid': 'next-due', text: nextDue ? `Próximo prazo: ${fmtDate(nextDue)}` : 'Nenhum prazo definido nas tarefas abertas.' }),
    el('button', { class: 'btn primary small', type: 'button', text: '+ Nova tarefa', 'data-testid': 'add-task', onClick: onNewTask }), taskList());

  const ownersSection = () => sec('Responsável',
    el('p', { 'data-testid': 'owner-line' }, el('strong', { text: 'Principal: ' }), stage.ownerId ? personName(s, stage.ownerId) : el('span', { class: 'undef', text: 'A definir' }),
      el('span', { class: 'sep', text: ' · ' }), el('strong', { text: 'Substituto: ' }), stage.substituteId ? personName(s, stage.substituteId) : el('span', { class: 'undef', text: 'A definir' })),
    el('button', { class: 'btn small', type: 'button', text: 'Definir / vincular pessoas', onClick: () => onTab('pessoas') }));

  const respSection = () => sec('Responsabilidades',
    stage.responsibilities.length ? bullets(stage.responsibilities, '') : el('p', { class: 'undef', text: 'A definir — nenhuma responsabilidade confirmada.' }),
    el('button', { class: 'btn small', type: 'button', text: 'Editar responsabilidades', onClick: () => onTab('resp') }));

  const linkedSection = () => {
    const ppl = participants(s, stage.id);
    return sec('Funcionários vinculados', ppl.length ? el('ul', { class: 'list', 'data-testid': 'linked-list' }, ppl.map((p) => {
      const mine = tasks.filter((t) => t.ownerId === p.id && t.status !== 'Concluída').length;
      const role = p.id === stage.ownerId ? 'Responsável principal' : p.id === stage.substituteId ? 'Substituto' : 'Participa';
      return el('li', { text: `${p.name}${p.role ? ` — ${p.role}` : ' — cargo A definir'} · ${role} · ${mine} tarefa(s) aberta(s) nesta etapa` });
    })) : el('p', { class: 'undef', text: 'A definir — nenhum funcionário vinculado.' }),
      el('button', { class: 'btn small', type: 'button', text: 'Vincular pessoas', onClick: () => onTab('pessoas') }));
  };

  const depsSection = () => {
    const deps = dependencies(s, stage.id);
    return sec('Dependências e transferências de responsabilidade',
      deps.length ? el('ul', { class: 'list', 'data-testid': 'deps-list' }, deps.map((d) => el('li', { class: d.waiting ? 'late' : '', 'data-dep': d.from.id },
        `Depende de "${d.from.name}" (${d.from.sector})${d.handoff ? ' ⇄ transferência entre setores' : ''}: `,
        d.loop ? '↺ retorno do fluxo — informativo, não bloqueia esta etapa'
          : d.optional ? '○ ramal opcional — não bloqueia'
            : d.progress.state === 'concluida' ? '✔ etapa anterior concluída'
              : d.waiting ? `⏳ etapa anterior NÃO concluída (${d.progress.open} tarefa(s) em aberto)`
                : d.progress.state === 'em-aberto' ? `✔ esta etapa já foi concluída (a anterior ainda tem ${d.progress.open} tarefa(s) em aberto)`
                  : '○ sem tarefas cadastradas na etapa anterior (não dá para verificar)')))
        : el('p', { class: 'muted', text: 'Etapa inicial: não depende de outra.' }),
      nb.next.length ? el('div', {}, el('h4', { text: 'Entregas para o próximo setor' }), el('ul', { class: 'list' }, nb.next.map((n) =>
        el('li', { text: `${n.name} (${n.sector}${n.sector !== stage.sector ? ' ⇄' : ''}): ${stage.outputs.join('; ') || 'entrega A definir'}` })))) : null);
  };

  const pendingSection = () => {
    const items = [];
    if (iss.noOwner) items.push(el('li', { class: 'warn', text: '⚠ Responsável principal ainda não confirmado (A definir).' }));
    dependencies(s, stage.id).filter((d) => d.waiting).forEach((d) => items.push(el('li', { class: 'late', text: `Aguardando etapa anterior: ${d.from.name} (${d.progress.open} em aberto)` })));
    tasks.filter((t) => isOverdue(t)).forEach((t) => items.push(el('li', { class: 'late', text: `Atrasada: ${t.title} (prazo ${fmtDate(t.due)})` })));
    tasks.filter((t) => t.status === 'Bloqueada').forEach((t) => items.push(el('li', { class: 'late', text: `Bloqueada: ${t.title}` })));
    const waiting = tasks.filter((t) => t.status === 'Aguardando terceiros');
    waiting.forEach((t) => items.push(el('li', { text: `Aguardando terceiros: ${t.title}` })));
    if (iss.open) items.push(el('li', { text: `${iss.open} tarefa(s) em aberto no total.` }));
    stage.problems.forEach((p) => items.push(el('li', { text: `Problema recorrente: ${p}` })));
    s.records.filter((r) => r.stageId === stage.id && recordActive(r)).forEach((r) => items.push(el('li', { text: `${r.kind} (${r.status}): ${r.title}` })));
    return sec('Pendências', items.length ? el('ul', { class: 'list', 'data-testid': 'pending-list' }, items) : el('p', { class: 'muted', text: 'Nenhuma pendência registrada.' }));
  };

  const flowSection = () => sec('Entradas e entregas',
    el('h4', { text: 'Entradas recebidas' }), bullets(stage.inputs, 'Não definidas.'),
    el('p', { class: 'muted' }, 'Vem de: ', navChips(nb.prev) || 'ninguém (início do fluxo)'),
    el('h4', { text: 'Entregas exigidas para o próximo setor' }), bullets(stage.outputs, 'Não definidas.'),
    el('p', { class: 'muted' }, 'Segue para: ', navChips(nb.next) || 'fim do fluxo'),
    el('small', { class: 'muted', text: '⇄ = transferência de responsabilidade entre setores.' }));

  const kpiSection = () => {
    const done = tasks.filter((t) => t.status === 'Concluída').length;
    return sec('Indicadores',
      stage.kpis.length ? bullets(stage.kpis, '') : el('p', { class: 'muted', text: 'Nenhum indicador definido.' }),
      tasks.length ? el('p', { 'data-testid': 'stage-counts', text: `Tarefas: ${iss.open} abertas · ${done} concluídas · ${iss.overdue} atrasadas · ${iss.blocked} bloqueadas` })
        : el('p', { class: 'muted', text: 'Sem dados registrados' }),
      el('details', { class: 'edit' }, el('summary', { text: 'Editar indicadores' }), textBlock(store, stage, 'kpis', 'Indicadores', '')));
  };

  const ideasSection = () => {
    const list = s.improvements.filter((i) => i.link?.type === 'stage' && i.link.id === stage.id);
    return sec('Sugestões de melhoria',
      list.length ? el('ul', { class: 'list', 'data-testid': 'stage-ideas' }, list.map((i) => el('li', { text: `${i.title} — ${i.status}` }))) : el('p', { class: 'muted', text: 'Nenhuma sugestão vinculada a esta etapa.' }),
      el('button', { class: 'btn small', type: 'button', 'data-testid': 'add-stage-idea', text: '+ Sugestão para esta etapa', onClick: () => improvementForm(store, null, { link: { type: 'stage', id: stage.id }, sector: stage.sector }) }));
  };

  const peopleSection = () => {
    const ppl = participants(s, stage.id);
    const free = s.employees.filter((e) => !ppl.some((p) => p.id === e.id));
    const pick = el('select', { 'data-testid': 'link-emp-select', 'aria-label': 'Funcionário a vincular' }, free.map((e) => el('option', { value: e.id, text: e.name })));
    return [
      sec('Responsáveis', personSel('ownerId', 'Responsável principal'), personSel('substituteId', 'Responsável substituto'),
        el('small', { class: 'muted', text: 'O responsável só é definido por você, aqui. Vincular uma pessoa à etapa não a torna responsável.' })),
      sec('Pessoas que participam desta etapa',
        ppl.length ? el('ul', { class: 'list' }, ppl.map((p) => el('li', {}, `${p.name}${p.role ? ` — ${p.role}` : ''} `,
          p.id === stage.ownerId && el('span', { class: 'pill', text: 'Responsável' }), p.id === stage.substituteId && el('span', { class: 'pill', text: 'Substituto' }),
          (p.stageIds || []).includes(stage.id) && el('button', { class: 'btn small', type: 'button', text: 'Desvincular', onClick: () => store.linkEmployee(p.id, stage.id, false) }))))
          : el('p', { class: 'muted', text: 'Ninguém vinculado.' }),
        free.length ? el('div', { class: 'inline-row' }, pick, el('button', { class: 'btn small', type: 'button', 'data-testid': 'link-emp-btn', text: 'Vincular à etapa', onClick: () => store.linkEmployee(pick.value, stage.id, true) })) : null,
        !s.employees.length && el('p', { class: 'muted', text: 'Nenhum funcionário cadastrado.' }),
        el('button', { class: 'btn small', type: 'button', 'data-testid': 'new-emp-here', text: '+ Cadastrar novo funcionário', onClick: () => employeeForm(store, null, { stageIds: [stage.id] }) }))];
  };

  function body() {
    switch (tab) {
      case 'resumo': return [
        sec('Objetivo', el('p', { text: stage.objective || 'Sem descrição.' })),
        ownersSection(), respSection(), linkedSection(), depsSection(), pendingSection(), tasksSection(), flowSection(), kpiSection(), ideasSection(),
        sec('Atividades previstas (hipótese inicial)', bullets(stage.activities, 'Nenhuma atividade cadastrada.'),
          el('button', { class: 'btn small', type: 'button', text: 'Editar etapa', 'data-testid': 'edit-stage', onClick: onEditStage })),
        sec('Observações', (() => { const ta = el('textarea', { rows: 3, value: stage.notes, 'aria-label': 'Observações da etapa' });
          return el('div', {}, ta, el('button', { class: 'btn small', type: 'button', text: 'Salvar observação', onClick: () => { store.updateStage(stage.id, { notes: ta.value }); toast('Salvo'); } })); })())];
      case 'resp': return [el('p', { class: 'muted', text: 'Responsabilidades confirmadas da etapa (nada vem preenchido por padrão).' }), textBlock(store, stage, 'responsibilities', 'Responsabilidades', 'Nenhuma responsabilidade definida — A definir.')];
      case 'tarefas': return [tasksSection()];
      case 'pessoas': return peopleSection();
      case 'fluxo': return [flowSection()];
      case 'kpis': return [kpiSection()];
      case 'problemas': return [el('p', { class: 'muted', text: 'Registre problemas recorrentes observados nesta etapa.' }), textBlock(store, stage, 'problems', 'Problemas recorrentes', 'Nenhum problema registrado.')];
      case 'ideias': return [ideasSection()];
      case 'hist': {
        const h = s.history.filter((x) => x.stageId === stage.id).slice(0, 50);
        return h.length ? el('ul', { class: 'list' }, h.map((x) => el('li', {}, el('small', { class: 'muted', text: fmtDateTime(x.at) }), ' ', x.text))) : el('p', { class: 'muted', text: 'Sem alterações registradas.' });
      }
      default: return null;
    }
  }

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
}
