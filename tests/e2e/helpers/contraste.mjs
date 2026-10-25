// Auditoria de contraste (WCAG 2.1 AA: 4.5:1 texto normal, 3:1 texto grande) de tudo o que está visível na página.
// Usada via page.evaluate(CONTRASTE): a função é serializada e roda no navegador (sem variáveis externas).
export const CONTRASTE = () => {
  const cache = new Map(), cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const parse = (s) => { if (cache.has(s)) return cache.get(s); cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; const c = [d[0], d[1], d[2], d[3] / 255]; cache.set(s, c); return c; };
  const over = (top, bottom) => { const a = top[3] + bottom[3] * (1 - top[3]); return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a); };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => { const layers = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] === 1) break; } let acc = parse(getComputedStyle(document.documentElement).backgroundColor); if (acc[3] < 1) acc = [255, 255, 255, 1]; for (const l of layers.reverse()) acc = over(l, acc); return acc; };
  const opac = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const modal = document.querySelector('dialog[open]');
  const bad = [], seen = new Set();
  const check = (el, label) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || cs.visibility !== 'visible' || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (modal && !modal.contains(el)) return;
    if (!modal && el.closest('dialog')) return;
    if (el.closest('.skip')) return;
    const bg = bgOf(el); let fg = parse(cs.color); fg = over(fg, bg); const o = opac(el);
    if (o < 1) fg = [0, 1, 2].map((i) => fg[i] * o + bg[i] * (1 - o)).concat(1);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700, large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5, got = ratio(fg, bg);
    if (got < need) { const key = `${el.tagName}.${el.className}|${label}`; if (!seen.has(key)) { seen.add(key); bad.push({ el: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`, text: label.slice(0, 40), ratio: Math.round(got * 100) / 100, need, fg: cs.color, bg: `rgb(${bg.slice(0, 3).map(Math.round)})` }); } }
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = n.nodeValue.trim(); const el = n.parentElement;
    if (!txt || !el || ['SCRIPT', 'STYLE', 'OPTION', 'OPTGROUP', 'TITLE'].includes(el.tagName) || el.closest('svg')) continue;
    check(el, txt);
  }
  document.querySelectorAll('input:not([type=checkbox]):not([type=file]),textarea,select').forEach((el) => check(el, `[${el.tagName.toLowerCase()}] ${el.value || ''}`));
  return bad;
};
