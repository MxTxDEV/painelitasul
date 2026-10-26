// Composição do comercial ITASUL OS. Tudo é função pura do tempo: window.renderFrame(t) posiciona cada camada.
// O painel real roda num <iframe>; os "cliques" são programáticos e idempotentes (estado alvo calculado a partir de t).
'use strict';
const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  inOut: (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out3: (k) => 1 - Math.pow(1 - k, 3), out5: (k) => 1 - Math.pow(1 - k, 5),
  outBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)), inCubic: (k) => k * k * k,
};
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fade = (t, a, b, c, d) => E.out3(prog(t, a, b)) * (1 - E.inCubic(prog(t, c, d)));   // sobe em [a,b], desce em [c,d]

let CUES, W, D, ST, UI;
const nodeT = {};                 // instante em que cada cartão aparece (cena do mapa)
const chips = [], particles = [];
const CHIP_LABELS = ['Orçamento', 'Entrega', 'Devolução', 'Reparo', 'Cobrança', 'Contrato', 'Caçamba 04', 'Munck', 'Vistoria', 'Agendamento', 'Retirada', 'Peças', 'Pós-venda', 'Disponibilidade', 'WhatsApp', 'Planilha', 'Recado', 'Ligar de volta', 'Pendente', 'Bloco de notas'];

/* ---------------- inicialização ---------------- */
async function init() {
  CUES = await (await fetch('cues.json')).json();
  CUES.nodeOrder.forEach((id, i) => { nodeT[id] = CUES.nodeRevealStart + i * CUES.nodeRevealStep; });
  // chips do caos
  const R = rng(7);
  CHIP_LABELS.forEach((label, i) => {
    const el = document.createElement('div'); el.className = 'chip' + (i % 5 === 0 ? ' hot' : ''); el.textContent = label; $('chips').append(el);
    chips.push({ el, bx: 120 + R() * 1680, by: 90 + R() * 880, a1: 20 + R() * 50, a2: 14 + R() * 40, f1: .5 + R() * 1.4, f2: .6 + R() * 1.6, p1: R() * 6.28, p2: R() * 6.28, rot: (R() - .5) * 26, gx: 960 + ((i % 5) - 2) * 330, gy: 585 + Math.floor(i / 5) * 118, sz: .85 + R() * .5 });
  });
  const P = rng(3); for (let i = 0; i < 70; i++) particles.push({ x: P() * 1920, y: P() * 1080, v: 8 + P() * 30, r: .6 + P() * 2.2, ph: P() * 6.28 });
  // pilares
  const ICON = {
    user: '<svg viewBox="0 0 100 100"><circle cx="40" cy="32" r="16"/><path d="M12 84c0-18 12-30 28-30s28 12 28 30"/><path d="M62 50l10 10 18-20"/></svg>',
    link: '<svg viewBox="0 0 100 100"><rect x="8" y="34" width="30" height="32" rx="8"/><rect x="62" y="34" width="30" height="32" rx="8"/><path d="M38 50h24M54 42l8 8-8 8"/></svg>',
    shield: '<svg viewBox="0 0 100 100"><path d="M50 8l34 12v26c0 22-14 38-34 46C30 84 16 68 16 46V20z"/><path d="M34 50l11 11 21-24"/></svg>',
  };
  [['user', 'Responsável definido.', 'Etapa sem dono aparece como “A definir”. Nada é atribuído por suposição.'], ['link', 'Dependência visível.', 'Se a etapa anterior está aberta, o painel mostra o gargalo antes do atraso.'], ['shield', 'Seus dados, protegidos.', 'Tudo salvo no navegador, com backup e importação seguros.']].forEach(([ic, h, p], i) => {
    const el = document.createElement('div'); el.className = 'pillar'; el.innerHTML = `<div class="n">0${i + 1}</div>${ICON[ic]}<h3>${h}</h3><p>${p}</p>`; $('pillars').append(el);
  });
  // granulado
  const c = document.createElement('canvas'); c.width = c.height = 220; const x = c.getContext('2d'), id = x.createImageData(220, 220), G = rng(11);
  for (let i = 0; i < id.data.length; i += 4) { const v = G() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
  // painel real
  await new Promise((ok) => { const f = $('app'); if (f.contentDocument?.readyState === 'complete' && f.contentWindow.__itasul) ok(); else f.addEventListener('load', ok, { once: true }); });
  W = $('app').contentWindow; D = W.document; ST = W.__itasul.store; UI = W.__itasul.ui;
  const css = D.createElement('style');
  css.textContent = `*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}.theme-anim,.theme-anim *,.theme-anim *::before{transition:none!important}#toast{display:none!important}html{scrollbar-width:none}::-webkit-scrollbar{display:none}.skip{display:none!important}`;
  D.head.append(css);
  seedDemo();
  await document.fonts.ready;
}

// Dados de DEMONSTRAÇÃO (só neste navegador de renderização). Nomes genéricos de equipes — nenhuma pessoa real.
function seedDemo() {
  const day = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');
  const eq = (name, sector, stageIds) => ST.addEmployee({ name, sector, role: 'Equipe', stageIds });
  const at = eq('Equipe Atendimento', 'Atendimento', ['s2', 's3']), co = eq('Equipe Comercial', 'Comercial', ['s4', 's6']), op = eq('Equipe Operação', 'Operação', ['s5', 's7', 's9']), fi = eq('Equipe Financeiro', 'Financeiro', ['s8']), ma = eq('Equipe Manutenção', 'Manutenção', ['s11']);
  [['s2', at], ['s3', at], ['s4', co], ['s5', op], ['s6', co], ['s7', op], ['s8', fi], ['s9', op], ['s11', ma]].forEach(([s, e]) => ST.updateStage(s, { ownerId: e.id }));
  const T = (stageId, title, o = {}) => ST.addTask({ stageId, title, ...o });
  const d = T('s2', 'Registrar solicitação', { ownerId: at.id, due: day(-1) }); ST.completeTask(d.id);
  T('s3', 'Confirmar equipamento solicitado', { ownerId: at.id, status: 'Em andamento', due: day(0), priority: 'Alta' });
  T('s4', 'Enviar orçamento ao cliente', { ownerId: co.id, status: 'Em andamento', due: day(-2), priority: 'Urgente' });
  T('s4', 'Negociar condições de locação', { ownerId: co.id, status: 'Bloqueada', due: day(1) });
  T('s4', 'Registrar objeções e resultado', { ownerId: co.id, due: day(2) });
  T('s5', 'Confirmar disponibilidade da caçamba', { ownerId: op.id, due: day(1) });
  T('s7', 'Programar entrega', { ownerId: op.id, due: day(0), priority: 'Alta' });
  T('s9', 'Inspecionar devolução', { ownerId: op.id, due: day(0) });
  T('s11', 'Revisar equipamento devolvido', { ownerId: ma.id, due: day(3) });
  T('s8', 'Conferir valores e vencimentos', { ownerId: fi.id, due: day(1) });
  const R = (kind, status, n) => { for (let i = 1; i <= n; i++) ST.addRecord({ kind, status, title: `${kind} ${String(i).padStart(2, '0')}`, stageId: kind === 'Orçamento' ? 's4' : 's7' }); };
  R('Orçamento', 'Aberto', 3); R('Orçamento', 'Aguardando retorno', 2); R('Locação', 'Em andamento', 4); R('Entrega', 'Programado', 3); R('Pendência financeira', 'Aberto', 1); R('Equipamento indisponível', 'Em andamento', 2); R('Manutenção', 'Aberto', 1);
  ST.addImprovement({ title: 'Checklist padrão de devolução', status: 'Em avaliação', link: { type: 'stage', id: 's9' } });
}

/* ---------------- painel real: estado alvo por tempo ---------------- */
const clickEl = (sel) => D.querySelector(sel)?.click();
function appTarget(t) {
  const path = (CUES.paths.find(([a, b]) => t >= a && t < b) || [0, 0, ''])[2];
  const view = t >= 26 && t < 32 ? 'rotina' : 'mapa';
  const selected = t >= 19.0 && t < 25.9 ? 's4' : null;
  const theme = t >= 33.0 && t < 34.7 ? 'claro' : 'escuro';
  const groups = t >= 27.8 && t < 28.8 ? ['atrasadas'] : t >= 28.8 && t < 30 ? ['pendentes'] : [];
  return { path: view === 'mapa' ? path : '', view, selected, theme, groups };
}
function applyApp(t) {
  const S = appTarget(t);
  if (D.documentElement.dataset.theme !== S.theme) clickEl('#theme-toggle');
  if (UI.view !== S.view) clickEl(`[data-view="${S.view}"]`);
  if (S.view === 'mapa') {
    if (UI.pathId !== S.path) clickEl(`[data-path="${S.path}"]`);
    if ((UI.selected || null) !== S.selected) { if (S.selected) clickEl(`[data-stage="${S.selected}"]`); else clickEl('#panel [aria-label="Fechar painel"]'); }
  } else {
    const have = UI.routine.groups; for (const g of ['pendentes', 'concluidas', 'atrasadas', 'bloqueadas']) { if (S.groups.includes(g) !== have.includes(g)) clickEl(`[data-group="${g}"]`); }
  }
  // rolagem: mapa à vista nas cenas do mapa/detalhe; topo nas demais
  const mapTop = (D.getElementById('map')?.offsetTop ?? 400) - 66;
  const sy = S.view === 'mapa' && t >= 10 && t < 26 ? mapTop : 0;
  W.scrollTo(0, sy);
  const panel = D.getElementById('panel');
  if (panel && !panel.hidden) panel.scrollTop = lerp(0, 760, E.inOut(prog(t, 20.2, 25.2)));
  revealMap(t);
}
function revealMap(t) {
  const nodes = D.querySelectorAll('.node'); if (!nodes.length) return;
  const done = t >= nodeT.s11 + .6 || t < 9;
  nodes.forEach((n) => {
    const k = done ? 1 : E.out3(prog(t, nodeT[n.dataset.stage] ?? 0, (nodeT[n.dataset.stage] ?? 0) + .4));
    if (k >= 1) { n.style.opacity = ''; n.style.transform = ''; } else { n.style.opacity = k; n.style.transform = `scale(${.72 + .28 * E.outBack(k)})`; }
  });
  const svg = D.querySelector('svg.edges'); if (!svg) return;
  const edges = ST.get().edges; let idx = -1;
  [...svg.children].forEach((c) => {
    if (c.tagName === 'path' && c.classList.contains('edge')) idx++;
    const e = edges[idx]; if (!e) return;
    const k = done ? 1 : prog(t, (nodeT[e.to] ?? nodeT[e.from] + .3) - .12, (nodeT[e.to] ?? nodeT[e.from] + .3) + .3);
    if (c.tagName === 'path' && c.classList.contains('edge')) {
      const L = c.getTotalLength();
      if (k >= 1) { c.style.strokeDasharray = ''; c.style.strokeDashoffset = ''; c.style.opacity = ''; c.setAttribute('marker-end', c.dataset.m || c.getAttribute('marker-end')); }
      else { c.dataset.m = c.dataset.m || c.getAttribute('marker-end'); c.style.strokeDasharray = L; c.style.strokeDashoffset = L * (1 - k); c.style.opacity = k > 0 ? 1 : 0; c.setAttribute('marker-end', k > .97 ? c.dataset.m : ''); }
    } else if (c.tagName === 'circle') { c.style.opacity = k >= 1 ? '' : (k > .6 ? 1 : 0); }
  });
}

/* ---------------- geometria (coordenadas do contêiner da janela 1600×936) ---------------- */
function pos(sel) { const e = D.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + 36, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + 36 + r.height / 2 }; }
const BASE = { fx: 800, fy: 468, S: .9 };
function camera(t) {
  let { fx, fy, S } = BASE, rx = 0, ry = 0, dy = 0;
  if (t < 10.9) { const k = E.out5(prog(t, 10.0, 10.9)); S = lerp(1.16, .9, k); rx = lerp(16, 0, k); ry = lerp(-9, 0, k); dy = lerp(70, 0, k); }
  else if (t < 14) { const k = E.inOut(prog(t, 10.9, 14)); S = lerp(.9, 1.1, k); fx = lerp(800, 840, k); fy = lerp(468, 560, k); }
  else if (t < 18) { const k = E.inOut(prog(t, 14, 18)); S = lerp(1.1, 1.2, k); fx = lerp(840, 800, k); fy = lerp(560, 575, k); }
  else if (t < 19.2) { const s4 = pos('[data-stage="s4"]'); const k = E.inOut(prog(t, 18.0, 19.0)); S = lerp(1.2, 1.7, k); fx = lerp(800, s4?.cx ?? 1100, k); fy = lerp(575, s4?.cy ?? 400, k); }
  else if (t < 26) {
    const p = pos('#panel'); const k = E.inOut(prog(t, 19.3, 20.5)); const slow = prog(t, 20.5, 26);
    const tx = p ? p.cx : 1180, ty = p ? p.y + 330 : 430;
    const s4 = pos('[data-stage="s4"]');
    S = lerp(1.7, 1.52, k) + .1 * slow; fx = lerp(s4?.cx ?? 1100, tx, k); fy = lerp(s4?.cy ?? 400, ty, k) + slow * 40;
  } else if (t < 32) { const k = prog(t, 26, 32); S = lerp(.95, 1.02, k); fy = 468 + k * 20; }
  else if (t < 36) { const k = E.inOut(prog(t, 32, 33)); S = lerp(1.0, 1.55, k) - .35 * E.inOut(prog(t, 34.8, 35.8)); fx = lerp(800, 700, k); fy = lerp(468, 330, k) + 140 * E.inOut(prog(t, 34.8, 35.8)); }
  else { const k = E.inOut(prog(t, 36, 36.9)); S = lerp(.9, .72, k); }
  return { fx, fy, S, rx, ry, dy };
}

/* ---------------- callouts (ancorados em elementos reais do painel) ---------------- */
const CALLOUTS = [
  { a: 12.1, b: 13.9, sel: '[data-stage="s1"]', text: 'Sem responsável? Fica em “A definir”.', cls: '', dx: 0, dy: -78 },
  { a: 20.7, b: 22.5, sel: '[data-testid="owner-line"]', text: 'Responsável à vista', cls: '', dx: 380, dy: -74 },
  { a: 22.6, b: 24.2, sel: '[data-testid="deps-list"] li.late', text: '⏳ Gargalo identificado', cls: 'red', dx: 60, dy: -74 },
  { a: 24.2, b: 25.8, sel: '#panel [data-testid="task-row"].late', text: 'Atrasada? Em destaque.', cls: 'red', dx: 260, dy: -74 },
  { a: 27.0, b: 29.6, sel: '#view-rotina .groups', text: 'Filtre por situação', cls: '', dx: 40, dy: 70 },
];
function renderCallouts(t, S) {
  const host = $('callouts'); if (!host.children.length) CALLOUTS.forEach((c) => { const el = document.createElement('div'); el.className = `callout ${c.cls}`; el.textContent = c.text; const r = document.createElement('div'); r.className = `ring ${c.cls}`; host.append(r, el); c.el = el; c.ring = r; });
  CALLOUTS.forEach((c) => {
    const k = fade(t, c.a, c.a + .35, c.b - .25, c.b); const p = k > 0 ? pos(c.sel) : null;
    if (!p || k <= 0.001) { c.el.style.opacity = 0; c.ring.style.opacity = 0; return; }
    const inv = 1 / S;
    c.el.style.opacity = k; c.el.style.left = `${p.x + c.dx}px`; c.el.style.top = `${p.y + c.dy + (1 - k) * 18}px`; c.el.style.transform = `scale(${inv * (.9 + .1 * E.outBack(k))})`;
    c.ring.style.opacity = k; c.ring.style.left = `${p.x - 8}px`; c.ring.style.top = `${p.y - 8}px`; c.ring.style.width = `${p.w + 16}px`; c.ring.style.height = `${p.h + 16}px`; c.ring.style.transform = `scale(${1 + (1 - k) * .1})`;
  });
}

/* ---------------- legendas ---------------- */
const CAPS = [[10.7, 14.0, 'Da solicitação à devolução. <em>Num só mapa.</em>'], [14.2, 18.0, 'Cada serviço, <em>seu caminho.</em>'], [19.7, 25.8, 'Responsáveis, tarefas e dependências <em>à vista.</em>'], [26.4, 31.8, 'Cada pessoa sabe <em>o que fazer hoje.</em>'], [32.7, 35.7, 'Claro ou escuro. <em>Sempre legível.</em>']];
function renderCaption(t) {
  const host = $('cap'); let html = '';
  for (const [a, b, text] of CAPS) { const k = fade(t, a, a + .4, b - .3, b); if (k > .001) html += `<div class="t" style="opacity:${k};transform:translateY(${(1 - k) * 28}px);display:block;width:max-content;margin:0 auto">${text}</div>`; }
  if (host.dataset.h !== html) { host.innerHTML = html; host.dataset.h = html; }
}

/* ---------------- fundo, partículas, abertura, caos, pilares, encerramento ---------------- */
function renderBg(t) {
  const calm = t >= 10 && t < 36 ? .45 : 1;
  const g1 = $('glow1'), g2 = $('glow2');
  g1.style.left = `${lerp(-300, 1000, .5 + .5 * Math.sin(t * .35))}px`; g1.style.top = `${lerp(-400, 200, .5 + .5 * Math.cos(t * .27))}px`; g1.style.opacity = (t < 2 ? .35 * prog(t, 1.2, 2) : (t >= 36 && t < 42 ? .55 : calm)).toFixed(3);
  g2.style.left = `${lerp(900, 1300, .5 + .5 * Math.sin(t * .22 + 2))}px`; g2.style.top = `${lerp(500, 800, .5 + .5 * Math.cos(t * .3))}px`; g2.style.opacity = (.7 * calm).toFixed(3);
  $('grid').style.transform = `translate(${(t * 14) % 96}px, ${(t * 9) % 96}px)`;
  const c = $('particles').getContext('2d'); c.clearRect(0, 0, 1920, 1080);
  const boost = t >= 4 && t < 10 ? 2.2 : 1;
  particles.forEach((p) => { const y = ((p.y - t * p.v * boost) % 1080 + 1080) % 1080, x = p.x + Math.sin(t * .6 + p.ph) * 20; c.fillStyle = `rgba(255,${120 + (p.ph * 20) | 0},${120 + (p.ph * 18) | 0},${.18 + .22 * Math.sin(t + p.ph) ** 2})`; c.beginPath(); c.arc(x, y, p.r, 0, 6.283); c.fill(); });
}
function renderOpen(t) {
  const L = $('open');
  const live = t < 4.2; L.style.display = live ? '' : 'none'; if (!live) return;
  const line = $('openline'); const kline = E.inOut(prog(t, .6, 1.7));
  line.style.width = `${1920 * kline}px`; line.style.left = `${(1920 - 1920 * kline) / 2}px`; line.style.opacity = t < 2.0 ? 1 : 1 - prog(t, 2.0, 2.25);
  line.style.transform = `scaleY(${1 + 3 * prog(t, 1.7, 2.0)})`;
  const k = prog(t, 2.0, 2.6); const blk = $('logo').querySelector('.blk'), os = $('logo').querySelector('.os');
  const w = $('logo').getBoundingClientRect().width; $('logo').style.marginLeft = `${-($('logo').offsetWidth) / 2}px`;
  blk.style.opacity = k > 0 ? 1 : 0; blk.style.transform = `scale(${lerp(1.5, 1, E.out5(k))})`; blk.style.clipPath = `inset(${(1 - E.out5(prog(t, 2.0, 2.3))) * 50}% 0 ${(1 - E.out5(prog(t, 2.0, 2.3))) * 50}% 0)`;
  const ko = E.out5(prog(t, 2.25, 2.85)); os.style.opacity = ko; os.style.transform = `translateX(${(1 - ko) * -60}px)`;
  const ks = E.out5(prog(t, 2.8, 3.5)); const sub = $('opensub'); sub.style.opacity = ks; sub.style.letterSpacing = `${lerp(.7, .22, ks)}em`; sub.style.transform = `translateY(${(1 - ks) * 12}px)`;
  const out = E.inCubic(prog(t, 3.45, 4.0)); $('logo').style.transform = `translateY(${-out * 40}px) scale(${1 + out * 1.8})`; L.style.opacity = 1 - prog(t, 3.7, 4.05); sub.style.opacity = ks * (1 - prog(t, 3.3, 3.6)); L.style.filter = `blur(${out * 14}px)`;
}
function renderChaos(t) {
  const L = $('chaos'); const live = t > 3.6 && t < 10.6; L.style.display = live ? '' : 'none'; if (!live) return;
  const tens = prog(t, 4, 6) + .8 * prog(t, 6, 8);
  chips.forEach((c, i) => {
    const wob = 1 + tens * 1.4 + (t > 6 && t < 8 ? Math.sin(t * 40 + i) * .35 : 0);
    let x = c.bx + Math.sin(t * c.f1 + c.p1) * c.a1 * wob, y = c.by + Math.cos(t * c.f2 + c.p2) * c.a2 * wob, rot = c.rot * (.4 + tens) * Math.sin(t * .9 + i), sc = c.sz;
    const k = E.out5(prog(t, 8.0 + i * .066, 8.0 + i * .066 + .55)); // converge para a grade
    x = lerp(x, c.gx, k); y = lerp(y, c.gy, k); rot = lerp(rot, 0, k); sc = lerp(sc, 1, k);
    const op = prog(t, 3.8 + i * .02, 4.4 + i * .02) * (1 - prog(t, 9.7, 10.2)) * (t < 8 ? .62 : .95);
    c.el.style.opacity = op.toFixed(3); c.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${rot}deg) scale(${sc})`;
    c.el.style.filter = t < 8 ? `blur(${(1 - k) * (1.2 + (i % 3) * .8)}px)` : '';
  });
  // palavras empilhadas
  const wr = $('words'); if (!wr.children.length) CUES.words.forEach(([, w]) => { const d = document.createElement('div'); d.className = 'word'; d.innerHTML = `<span>${w}</span>`; wr.append(d); });
  const wOut = E.inCubic(prog(t, 6.0, 6.35));
  [...wr.children].forEach((d, i) => { const k = E.out5(prog(t, CUES.words[i][0], CUES.words[i][0] + .38)); d.firstChild.style.transform = `translateY(${(1 - k) * 118}%)`; d.firstChild.style.visibility = k > 0 ? 'visible' : 'hidden'; d.style.height = '132px'; d.firstChild.style.opacity = 1; d.style.opacity = 1 - wOut; d.style.color = i === 3 && t > 5.5 ? '#ff3b57' : ''; });
  wr.style.transform = `translateX(${-wOut * 300}px)`;
  const ao = $('allonce'); const ka = E.out5(prog(t, 6.0, 6.4)); const kaOut = prog(t, 7.7, 8.0);
  ao.style.opacity = ka * (1 - kaOut); ao.style.transform = `scale(${lerp(1.35, 1, ka)}) translate(${t > 6.4 && t < 7.7 ? Math.sin(t * 55) * 2.2 : 0}px, ${t > 6.4 && t < 7.7 ? Math.cos(t * 47) * 1.6 : 0}px)`;
  const q = $('question'); const kq = E.out5(prog(t, 8.1, 8.8)); q.style.opacity = kq * (1 - prog(t, 9.6, 10.0)); q.style.transform = `translateY(${(1 - kq) * 40}px)`;
}
function renderPillars(t) {
  const L = $('pillarsL'); const live = t > 35.8 && t < 42.4; L.style.display = live ? '' : 'none'; if (!live) return;
  L.style.opacity = 1 - prog(t, 41.5, 42.0);
  const tt = E.out5(prog(t, 36.1, 36.8)); $('pilltitle').style.opacity = tt; $('pilltitle').style.transform = `translateX(${(1 - tt) * -60}px)`;
  [...$('pillars').children].forEach((p, i) => { const a = [36.2, 37.7, 39.2][i]; const k = E.outBack(prog(t, a, a + .7)); p.style.opacity = prog(t, a, a + .25); p.style.transform = `translateY(${(1 - k) * 90}px) rotateX(${(1 - k) * 22}deg) scale(${.94 + .06 * k})`;
    p.querySelectorAll('svg *').forEach((s) => { const Lh = s.getTotalLength ? s.getTotalLength() : 200; s.style.strokeDasharray = Lh; s.style.strokeDashoffset = Lh * (1 - E.out3(prog(t, a + .1, a + 1.0))); }); });
}
function renderOutro(t) {
  const L = $('outro'); const live = t >= 41.6; L.style.display = live ? '' : 'none'; if (!live) return;
  const kl = E.out5(prog(t, 42.0, 42.7)); const l2 = $('logo2'); l2.style.marginLeft = `${-l2.offsetWidth / 2}px`; l2.style.opacity = kl; l2.style.transform = `scale(${lerp(1.35, 1, kl)})`;
  const kt = E.out5(prog(t, 42.8, 43.5)); $('tag').style.opacity = kt; $('tag').style.transform = `translateY(${(1 - kt) * 50}px)`; $('tag').style.letterSpacing = `${lerp(.05, -.025, kt)}em`;
  const kc = E.out3(prog(t, 43.7, 44.4)); $('cta').style.opacity = kc; $('cta').style.transform = `translateY(${(1 - kc) * 20}px)`; $('disc').style.opacity = prog(t, 44.2, 44.8) * .9;
}

/* ---------------- quadro ---------------- */
function shakeAmt(t) { let a = 0; for (const [at, big] of [[2.0, 14], [6.0, 9], [10.0, 16], [42.0, 12]]) { const d = t - at; if (d >= 0 && d < .6) a += big * Math.pow(1 - d / .6, 2) * Math.sin(d * 90); } return a; }
function renderFrame(t) {
  applyApp(t);
  renderBg(t);
  // janela do painel
  const live = t >= 9.9 && t < 37.2; const cw = $('camwrap'); cw.style.display = live ? '' : 'none';
  if (live) {
    const cam = camera(t); const entr = E.out3(prog(t, 10.0, 10.6)); const out = E.inOut(prog(t, 36.1, 36.9));
    $('cam').style.transformOrigin = `${cam.fx}px ${cam.fy}px`;
    $('cam').style.transform = `translate(${960 - cam.fx}px, ${540 - cam.fy + cam.dy}px) scale(${cam.S}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg)`;
    cw.style.opacity = entr * (1 - out); cw.style.filter = out > 0 ? `blur(${out * 12}px) brightness(${1 - .5 * out})` : (t < 10.5 ? `blur(${(1 - entr) * 10}px)` : '');
    renderCallouts(t, cam.S);
  }
  renderCaption(t); renderOpen(t); renderChaos(t); renderPillars(t); renderOutro(t);
  // efeitos
  const sh = shakeAmt(t); $('stage').style.transform = `translate(${sh * .7}px, ${sh * .5}px) rotate(${sh * .02}deg) scale(1.012)`;
  const fl = (d, dur, amp) => (d >= 0 && d < dur ? amp * Math.pow(1 - d / dur, 2) : 0);
  $('flash').style.opacity = (fl(t - 2.0, .22, .55) + fl(t - 42.0, .22, .5) + fl(t - 9.98, .25, .6)).toFixed(3);
  $('redflash').style.opacity = (fl(t - 6.0, .35, .5)).toFixed(3);
  // transição de tema: círculo de revelação a partir do botão
  const wipe = $('wipe'); const tw = [[33.0, '#f1f1ef'], [34.7, '#101012']].map(([a, c]) => ({ a, c })).find((w) => t >= w.a - .01 && t < w.a + .6);
  if (tw) { const k = prog(t, tw.a, tw.a + .6); wipe.style.display = ''; wipe.style.background = tw.c; wipe.style.opacity = (1 - E.inCubic(k)) * .55; wipe.style.clipPath = `circle(${E.out3(k) * 2300}px at 1790px 60px)`; } else wipe.style.display = 'none';
  $('vig').style.opacity = t >= 32.9 && t < 36 ? (1 - .65 * Math.min(prog(t, 32.9, 33.2), 1 - prog(t, 34.9, 35.5) * 0)) : 1;
  $('grain').style.backgroundPosition = `${(t * 9973) % 220}px ${(t * 7919) % 220}px`;
  const fadeOut = prog(t, 47.0, 48.0), fadeIn = 1 - prog(t, 0, .35); $('fade').style.opacity = Math.max(fadeOut, fadeIn);
}
window.renderFrame = renderFrame;
window.ready = init();
