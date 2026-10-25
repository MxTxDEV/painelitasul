// Helpers de DOM. Todo texto entra via textContent/createTextNode — nunca innerHTML — para evitar XSS com dados cadastrados.
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'open']);

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  append(n, ...kids);
  return n;
}

export function append(n, ...kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return n;
}

// Substitui o conteúdo de `host` ignorando null/undefined/false (o replaceChildren nativo escreveria "null" na tela).
export const render = (host, ...kids) => append(clear(host), ...kids);
export const clear = (n) => { n.replaceChildren(); return n; };

export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

let toastTimer;
const TOAST = { success: ['✔', 'success'], error: ['✖ Erro:', 'error'], info: ['ℹ', ''] };
// kind: 'success' | 'error' | 'info' (ou true = erro, por compatibilidade). Ícone e rótulo acompanham a cor.
export function toast(msg, kind = 'info') {
  const k = kind === true ? 'error' : kind === false ? 'info' : kind;
  const [icon, cls] = TOAST[k] || TOAST.info;
  const t = document.getElementById('toast');
  t.textContent = `${icon} ${msg}`; t.className = `toast show ${cls}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, k === 'error' ? 6000 : 3500);
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    const d = el('dialog', { class: 'modal small' },
      el('p', { text: message }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', text: 'Cancelar', onClick: () => d.close('no') }),
        el('button', { class: 'btn primary', type: 'button', text: 'Confirmar', 'data-testid': 'confirm-yes', onClick: () => d.close('yes') })));
    d.addEventListener('close', () => { d.remove(); resolve(d.returnValue === 'yes'); });
    document.body.append(d); d.showModal();
  });
}
