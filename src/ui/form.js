// Formulário modal genérico. fields: [{name,label,type,options,required,hint}]
// type: text | textarea | select | date | number | checks
import { el, toast } from './dom.js';

export function openForm({ title, fields, values = {}, onSubmit, onDelete, submitLabel = 'Salvar' }) {
  const inputs = {};
  const rows = fields.map((f) => {
    const v = values[f.name];
    let input;
    if (f.type === 'textarea') input = el('textarea', { rows: f.rows || 3, value: v ?? '' });
    else if (f.type === 'select') {
      input = el('select', {}, f.options.map((o) => el('option', { value: o.value, selected: String(o.value) === String(v ?? ''), text: o.label })));
    } else if (f.type === 'checks') {
      const sel = new Set(v || []);
      input = el('div', { class: 'checks' }, f.options.map((o) =>
        el('label', { class: 'check' }, el('input', { type: 'checkbox', value: o.value, checked: sel.has(o.value) }), ' ', o.label)));
    } else input = el('input', { type: f.type || 'text', value: v ?? '', min: f.type === 'number' ? 0 : null });
    if (f.required) input.setAttribute?.('required', '');
    inputs[f.name] = { input, f };
    return el('label', { class: 'field' }, el('span', { class: 'lbl', text: f.label }), input, f.hint && el('small', { text: f.hint }));
  });
  // inputs do tipo "checks" são <div>: label->div não funciona como associação, mas o usuário clica nos checkboxes internos.

  const dlg = el('dialog', { class: 'modal', 'aria-label': title });
  const form = el('form', { method: 'dialog', novalidate: true }, el('h2', { text: title }), rows,
    el('div', { class: 'actions' },
      onDelete && el('button', { class: 'btn danger left', type: 'button', text: 'Excluir', onClick: async () => { try { if (await onDelete()) dlg.close(); } catch (e) { toast(e.message, true); } } }),
      el('button', { class: 'btn', type: 'button', text: 'Cancelar', onClick: () => dlg.close() }),
      el('button', { class: 'btn primary', type: 'submit', text: submitLabel })));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const out = {};
    for (const [name, { input, f }] of Object.entries(inputs)) {
      if (f.type === 'checks') out[name] = [...input.querySelectorAll('input:checked')].map((c) => c.value);
      else out[name] = input.value;
      if (f.required && !String(out[name]).trim()) { toast(`Preencha: ${f.label}`, true); return; }
    }
    try { onSubmit(out); dlg.close(); } catch (e) { toast(e.message, true); }
  });
  dlg.append(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
  return dlg;
}

export const options = (list, { blank } = {}) => [
  ...(blank !== undefined ? [{ value: '', label: blank }] : []),
  ...list.map((x) => (typeof x === 'string' ? { value: x, label: x } : x)),
];
