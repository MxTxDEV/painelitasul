// Central de Melhorias. Ideias da IA ficam em seção própria e só viram sugestão por ação do usuário.
import { el, render, confirmDialog } from './dom.js';
import { openForm, options } from './form.js';
import { IMPROVEMENT_STATUSES, LEVELS, SECTORS, AI_SUGGESTIONS } from '../data/seed.js';
import { byId, personName } from '../state/logic.js';

export function linkLabel(s, link) {
  if (!link) return '';
  const t = { stage: ['Etapa', s.stages], task: ['Tarefa', s.tasks], employee: ['Funcionário', s.employees] }[link.type];
  const item = t && byId(t[1], link.id);
  return item ? `${t[0]}: ${item.name || item.title}` : '';
}

export function improvementForm(store, imp, preset = {}) {
  const s = store.get();
  const linkOpts = [{ value: '', label: 'Sem vínculo' },
    ...s.stages.map((x) => ({ value: `stage:${x.id}`, label: `Etapa: ${x.name}` })),
    ...s.tasks.map((x) => ({ value: `task:${x.id}`, label: `Tarefa: ${x.title}` })),
    ...s.employees.map((x) => ({ value: `employee:${x.id}`, label: `Funcionário: ${x.name}` }))];
  const cur = imp?.link || preset.link;
  openForm({
    title: imp ? 'Editar sugestão' : 'Nova sugestão de melhoria',
    values: { ...(imp || preset), link: cur ? `${cur.type}:${cur.id}` : '' },
    fields: [
      { name: 'title', label: 'Título', required: true },
      { name: 'problem', label: 'Problema observado', type: 'textarea', rows: 2 },
      { name: 'idea', label: 'Ideia de solução', type: 'textarea', rows: 2 },
      { name: 'benefit', label: 'Benefício esperado', type: 'textarea', rows: 2 },
      { name: 'sector', label: 'Setor afetado', type: 'select', options: options(SECTORS, { blank: 'A definir' }) },
      { name: 'reviewerId', label: 'Responsável por avaliar', type: 'select', options: options(s.employees.map((e) => ({ value: e.id, label: e.name })), { blank: 'A definir' }) },
      { name: 'cost', label: 'Custo estimado (se conhecido)', hint: 'Deixe vazio se não souber.' },
      { name: 'impact', label: 'Impacto esperado', type: 'select', options: options(LEVELS) },
      { name: 'difficulty', label: 'Dificuldade de implementação', type: 'select', options: options(LEVELS) },
      { name: 'status', label: 'Status', type: 'select', options: options(IMPROVEMENT_STATUSES) },
      { name: 'nextAction', label: 'Próxima ação' },
      { name: 'link', label: 'Vincular a', type: 'select', options: linkOpts },
    ],
    onSubmit: (v) => {
      const [type, id] = v.link ? v.link.split(/:(.+)/) : [];
      const d = { ...v, reviewerId: v.reviewerId || null, link: v.link ? { type, id } : null };
      if (imp) store.updateImprovement(imp.id, d); else store.addImprovement(d);
    },
    onDelete: imp ? async () => { if (await confirmDialog('Excluir esta sugestão?')) { store.deleteImprovement(imp.id); return true; } return false; } : null,
  });
}

export function renderImprovements(host, { store, statusFilter, onFilter }) {
  const s = store.get();
  const list = s.improvements.filter((i) => !statusFilter || i.status === statusFilter);
  render(host,
    el('div', { class: 'view-head' },
      el('div', {}, el('h2', { text: 'Central de Melhorias' }), el('p', { class: 'muted', text: 'Registre problemas e ideias. Cada sugestão pode ser vinculada a uma etapa, tarefa ou funcionário.' })),
      el('button', { class: 'btn primary', type: 'button', 'data-testid': 'add-improvement', text: '+ Nova sugestão', onClick: () => improvementForm(store) })),
    el('label', { class: 'inline-filter' }, 'Status: ',
      el('select', { 'aria-label': 'Filtrar sugestões por status', onChange: (e) => onFilter(e.target.value) },
        options(IMPROVEMENT_STATUSES, { blank: 'Todos' }).map((o) => el('option', { value: o.value, text: o.label, selected: o.value === statusFilter })))),
    list.length ? el('div', { class: 'cards' }, list.map((i) => el('article', { class: 'imp', 'data-testid': 'imp-card' },
      el('header', {}, el('h4', { text: i.title }), el('span', { class: 'pill', text: i.status })),
      i.problem && el('p', {}, el('strong', { text: 'Problema: ' }), i.problem),
      i.idea && el('p', {}, el('strong', { text: 'Solução: ' }), i.idea),
      i.benefit && el('p', {}, el('strong', { text: 'Benefício: ' }), i.benefit),
      el('p', { class: 'muted small', text: `Setor: ${i.sector || 'A definir'} · Avalia: ${personName(s, i.reviewerId)} · Impacto: ${i.impact} · Dificuldade: ${i.difficulty} · Custo: ${i.cost || 'não informado'}` }),
      i.nextAction && el('p', {}, el('strong', { text: 'Próxima ação: ' }), i.nextAction),
      linkLabel(s, i.link) && el('p', { class: 'muted small', text: `Vinculada a ${linkLabel(s, i.link)}` }),
      el('button', { class: 'btn small', type: 'button', text: 'Editar', onClick: () => improvementForm(store, i) }))))
      : el('p', { class: 'empty', text: s.improvements.length ? 'Nenhuma sugestão com esse status.' : 'Nenhuma sugestão cadastrada.' }),
    el('section', { class: 'ai-box' },
      el('h3', { text: 'Ideias sugeridas pela IA' }),
      el('p', { class: 'ai-warn', text: 'Isto são apenas sugestões automáticas — NÃO são decisões aprovadas. Nada aqui altera o painel até você adotar.' }),
      el('div', { class: 'cards' }, AI_SUGGESTIONS.map((a) => el('article', { class: 'imp ai', 'data-testid': 'ai-card' },
        el('header', {}, el('h4', { text: a.title }), el('span', { class: 'pill ai-pill', text: 'Sugestão da IA' })),
        el('p', {}, el('strong', { text: 'Problema possível: ' }), a.problem),
        el('p', {}, el('strong', { text: 'Ideia: ' }), a.idea),
        el('button', { class: 'btn small', type: 'button', text: 'Adotar como sugestão (Nova)', onClick: () => improvementForm(store, null, { title: a.title, problem: a.problem, idea: a.idea, status: 'Nova', link: { type: 'stage', id: a.stageId } }) }))))));
}
