// Formas do mapa: serpentina, raias, árvore, circular, linha do tempo, quadro por setor e lista.
// Dados fictícios só em contextos isolados. Uso: node tests/e2e/formas.mjs [pasta-capturas]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { start } from '../../tools/serve.mjs';
import { CONTRASTE } from './helpers/contraste.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const shots = process.argv[2]; if (shots) mkdirSync(shots, { recursive: true });
const server = await start(0), url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const falhas = []; let step = '';
const t = async (name, fn) => { step = name; try { await fn(); console.log(`ok  ${name}`); } catch (e) { falhas.push(name); console.log(`XX  ${name}\n      ${String(e.message).split('\n')[0]}`); } };
const newPage = async (o = {}) => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text())); return p; };
const MODES = ['mapa', 'raias', 'arvore', 'circulo', 'timeline', 'setores', 'lista'], CANVAS = ['mapa', 'raias', 'arvore', 'circulo'];
const seed = (p) => p.evaluate(() => { const st = window.__itasul.store, d = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');
  const a = st.addEmployee({ name: 'Func. Teste A', sector: 'Comercial' }); st.updateStage('s4', { ownerId: a.id });
  st.addTask({ stageId: 's3', title: 'Aberta s3', ownerId: a.id, due: d(-2) }); st.addTask({ stageId: 's4', title: 'Bloqueada s4', ownerId: a.id, status: 'Bloqueada', priority: 'Alta' }); st.addTask({ stageId: 's7', title: 'Aberta s7' }); });
const pick = async (p, m) => { await p.click(`[data-mode="${m}"]`); assert.equal(await p.evaluate(() => window.__itasul.ui.mode), m); };
const visibleCount = (p, sel) => p.locator(sel).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).length);

try {
  await t('seletor "Forma do mapa": 7 opções, uma ativa (aria-pressed), padrão = Serpentina no desktop', async () => {
    const p = await newPage(); await p.goto(url);
    assert.deepEqual(await p.locator('#modes [data-mode]').evaluateAll((b) => b.map((x) => x.dataset.mode)), MODES);
    assert.equal(await p.locator('#modes [aria-pressed="true"]').count(), 1); assert.equal(await p.locator('#modes [data-mode="mapa"]').getAttribute('aria-pressed'), 'true');
    assert.match(await p.locator('#modes [data-mode="raias"]').innerText(), /Raias por setor/); await p.context().close();
  });
  await t('cada forma mostra todas as 13 etapas e só a visão correta fica visível', async () => {
    const p = await newPage(); await p.goto(url); await seed(p);
    for (const m of MODES) {
      await pick(p, m);
      const canvas = CANVAS.includes(m);
      assert.equal(await p.locator('#map').isVisible(), canvas, `${m}: mapa`); assert.equal(await p.locator('#stage-list').isVisible(), !canvas, `${m}: lista`);
      assert.equal(await p.locator('#map-tools').isVisible(), canvas, `${m}: zoom só nas formas de mapa`);
      const n = canvas ? await visibleCount(p, '#map .node') : await visibleCount(p, '#stage-list [data-stage]');
      assert.equal(n, 13, `${m}: ${n} etapas`);
    }
    assert.deepEqual(p.errors, []); await p.context().close();
  });
  await t('raias: uma faixa por setor com o nome; árvore, circular e serpentina marcam o modo no canvas', async () => {
    const p = await newPage(); await p.goto(url);
    await pick(p, 'raias'); assert.deepEqual((await p.locator('#map .lane-label').allInnerTexts()).sort(), ['Atendimento', 'Comercial', 'Financeiro', 'Manutenção', 'Marketing', 'Operação', 'Pós-venda']);
    for (const m of CANVAS) { await pick(p, m); assert.equal(await p.locator(`#map .canvas[data-mode="${m}"]`).count(), 1); }
    await pick(p, 'circulo'); assert.equal(await p.locator('#map .ring-label').innerText(), 'Fluxo de locação'); await p.context().close();
  });
  await t('seleção: clicar em qualquer etapa de qualquer forma abre o painel da etapa certa', async () => {
    const p = await newPage(); await p.goto(url); await seed(p);
    for (const m of MODES) { await pick(p, m); for (const [id, nome] of [['s4', 'Comercial e orçamento'], ['b_munck', 'Análise das necessidades']]) {
      await p.evaluate(() => { document.querySelector('#panel button[aria-label="Fechar painel"]')?.click(); });
      if (CANVAS.includes(m)) await p.click('#zoom-fit').catch(() => {});
      await p.evaluate((i) => document.querySelector(`[data-stage="${i}"]`).click(), id);
      assert.match(await p.locator('#panel h2').innerText(), new RegExp(nome), `${m}/${id}`);
      assert.equal(await p.locator(`[data-stage="${id}"].selected`).count(), 1, `${m}/${id}: selecionado`);
    } } await p.context().close();
  });
  await t('filtros por setor/status esmaecem as demais etapas em todas as formas', async () => {
    const p = await newPage(); await p.goto(url); await seed(p);
    for (const m of MODES) {
      await pick(p, m); await p.selectOption('[data-filter="sector"]', 'Comercial');
      const sel = CANVAS.includes(m) ? '#map [data-stage]' : '#stage-list [data-stage]';
      const live = await p.locator(sel).evaluateAll((e) => e.filter((x) => !x.classList.contains('dim')).map((x) => x.dataset.stage).sort());
      assert.deepEqual(live, ['b_munck', 's4', 's6'], m);
      await p.click('[data-testid="clear-filters"]'); await p.selectOption('[data-filter="status"]', 'Bloqueada');
      assert.deepEqual(await p.locator(sel).evaluateAll((e) => e.filter((x) => !x.classList.contains('dim')).map((x) => x.dataset.stage)), ['s4'], `${m}: status`);
      await p.click('[data-testid="clear-filters"]');
    } await p.context().close();
  });
  await t('caminhos específicos destacam as mesmas etapas em todas as formas', async () => {
    const p = await newPage(); await p.goto(url);
    const exp = { cacambas: ['b_dest', 's2', 's4', 's5', 's7', 's8'], munck: ['b_munck', 's2', 's4', 's5', 's7', 's8'], manutencao: ['s11', 's9'] };
    for (const m of MODES) { await pick(p, m); for (const [id, ids] of Object.entries(exp)) {
      await p.click(`[data-path="${id}"]`);
      const sel = CANVAS.includes(m) ? '#map' : '#stage-list';
      assert.deepEqual(await p.locator(`${sel} .in-path`).evaluateAll((e) => e.map((x) => x.dataset.stage).sort()), ids, `${m}/${id}`);
    } await p.click('[data-path=""]'); }
    await pick(p, 'timeline'); await p.click('[data-path="cacambas"]');
    assert.deepEqual(await p.locator('#stage-list .via').evaluateAll((e) => e.map((x) => x.dataset.stage).sort()), ['s3', 's6'], 'etapas intermediárias');
    await p.context().close();
  });
  await t('linha do tempo: transferências entre setores (⇄), retorno (↺) e fim do fluxo', async () => {
    const p = await newPage(); await p.goto(url);
    await pick(p, 'timeline');
    const info = await p.evaluate(() => { const s = window.__itasul.store.get(); return { hand: s.edges.filter((e) => s.stages.find((x) => x.id === e.from).sector !== s.stages.find((x) => x.id === e.to).sector).length, loops: s.edges.filter((e) => e.loop).length }; });
    assert.equal(await p.locator('.tl-link.handoff').count(), info.hand, 'um chip ⇄ para cada ligação que muda de setor (inclui o retorno 11→5)');
    assert.equal(await p.locator('.tl-link.loop').count(), info.loops); assert.match(await p.locator('.tl-link.loop').innerText(), /↺ retorna para 5\./);
    assert.match(await p.locator('.tl-item:has([data-stage="s3"]) .tl-link.handoff').first().innerText(), /Atendimento → Comercial/);
    assert.ok(await p.locator('.tl-item .muted:text("Fim do fluxo")').count() >= 1);
    await p.click('.tl-item:has([data-stage="s3"]) .tl-link >> nth=0'); assert.match(await p.locator('#panel h2').innerText(), /Comercial e orçamento/, 'chip leva à etapa seguinte');
    await p.context().close();
  });
  await t('quadro por setor: uma coluna por setor com a contagem correta e pendências do setor', async () => {
    const p = await newPage(); await p.goto(url); await seed(p); await pick(p, 'setores');
    const cols = await p.locator('.board-col').evaluateAll((c) => c.map((x) => [x.dataset.sector, x.querySelectorAll('[data-stage]').length]));
    const exp = await p.evaluate(() => { const m = {}; window.__itasul.store.get().stages.forEach((s) => { m[s.sector] = (m[s.sector] || 0) + 1; }); return m; });
    assert.equal(cols.length, Object.keys(exp).length); for (const [sec, n] of cols) assert.equal(n, exp[sec], sec);
    assert.match(await p.locator('.board-col[data-sector="Atendimento"] header p').innerText(), /1 atrasada/);
    await p.context().close();
  });
  await t('teclado: setas navegam entre cartões nas formas de mapa; Tab+Enter nas visões em lista', async () => {
    const p = await newPage(); await p.goto(url);
    for (const m of ['raias', 'arvore', 'circulo']) { await pick(p, m); await p.focus('[data-stage="s1"]'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowDown'); const f = await p.evaluate(() => document.activeElement.dataset.stage); assert.ok(f && f !== 's1', `${m}: foco moveu`); await p.keyboard.press('Enter'); assert.equal(await p.locator('#panel').isVisible(), true, `${m}: Enter abre`); await p.click('#panel [aria-label="Fechar painel"]'); }
    for (const m of ['timeline', 'setores', 'lista']) { await pick(p, m); await p.focus('[data-stage="s2"]'); await p.keyboard.press('Enter'); assert.match(await p.locator('#panel h2').innerText(), /Entrada do cliente/, m); assert.equal(await p.evaluate(() => document.activeElement.dataset.stage), 's2', `${m}: foco permanece`); await p.click('#panel [aria-label="Fechar painel"]'); }
    await p.context().close();
  });
  await t('zoom, "Ajustar" e arrastar funcionam nas formas de mapa (sem fechar o painel)', async () => {
    const p = await newPage(); await p.goto(url);
    for (const m of ['raias', 'arvore', 'circulo']) {
      await pick(p, m); await p.evaluate(() => window.scrollTo(0, document.querySelector('#map').offsetTop - 70));
      const tr = () => p.locator('.canvas').evaluate((n) => n.style.transform); const k = async () => Number((await tr()).match(/scale\(([\d.]+)\)/)[1]);
      const a = await k(); await p.click('#zoom-in'); assert.ok(await k() > a, `${m}: zoom +`); await p.click('#zoom-out'); await p.click('#zoom-fit');
      const pt = await p.evaluate(() => { const r = document.querySelector('#map').getBoundingClientRect(); for (let y = r.top + 40; y < Math.min(r.bottom, innerHeight) - 30; y += 20) for (let x = r.left + 30; x < r.right - 30; x += 20) { const e = document.elementFromPoint(x, y); if (e && !e.closest('.node') && e.closest('#map')) return [x, y]; } return null; });
      const before = await tr(); await p.mouse.move(...pt); await p.mouse.down(); await p.mouse.move(pt[0] + 60, pt[1] + 30, { steps: 5 }); await p.mouse.up(); assert.notEqual(await tr(), before, `${m}: arrastar`);
    } await p.context().close();
  });
  await t('painel aberto: a etapa selecionada fica à vista e legível em todas as formas de mapa', async () => {
    const p = await newPage(); await p.goto(url);
    for (const m of CANVAS) { await pick(p, m); await p.evaluate(() => document.querySelector('#map [data-stage="s5"]').click());
      const r = await p.evaluate(() => { const n = document.querySelector('#map [data-stage="s5"]').getBoundingClientRect(), mp = document.querySelector('#map').getBoundingClientRect(); return { inside: n.left >= mp.left - 1 && n.right <= mp.right + 1 && n.top >= mp.top - 1 && n.bottom <= mp.bottom + 1, k: Number(document.querySelector('.canvas').style.transform.match(/scale\(([\d.]+)\)/)[1]) }; });
      assert.ok(r.inside, `${m}: fora da área`); assert.ok(r.k >= 0.78, `${m}: zoom ${r.k}`); await p.click('#panel [aria-label="Fechar painel"]'); }
    await p.context().close();
  });
  await t('escolha da forma persiste após recarregar; valor inválido é ignorado; botão "Ver como lista" continua funcionando', async () => {
    const p = await newPage(); await p.goto(url);
    await pick(p, 'circulo'); await p.reload(); assert.equal(await p.evaluate(() => window.__itasul.ui.mode), 'circulo'); assert.equal(await p.locator('#map .canvas[data-mode="circulo"]').count(), 1);
    assert.equal(await p.evaluate(() => localStorage.getItem('itasul-forma')), 'circulo');
    await p.click('#layout-toggle'); assert.equal(await p.evaluate(() => window.__itasul.ui.mode), 'lista'); await p.click('#layout-toggle'); assert.equal(await p.evaluate(() => window.__itasul.ui.mode), 'circulo', 'volta à forma anterior');
    await p.evaluate(() => localStorage.setItem('itasul-forma', 'lixo')); await p.reload(); assert.equal(await p.evaluate(() => window.__itasul.ui.mode), 'mapa');
    const m = await newPage({ viewport: { width: 390, height: 800 } }); await m.goto(url); assert.equal(await m.evaluate(() => window.__itasul.ui.mode), 'lista', 'celular abre em lista sem preferência salva');
    await p.context().close(); await m.context().close();
  });
  await t('dados não mudam ao trocar de forma (posições salvas e cadastros intactos)', async () => {
    const p = await newPage(); await p.goto(url); await seed(p);
    const snap = () => p.evaluate(() => JSON.stringify(window.__itasul.store.get())); const antes = await snap();
    for (const m of MODES) await pick(p, m); await p.reload(); assert.equal(await snap(), antes); await p.context().close();
  });
  for (const theme of ['light', 'dark']) await t(`tema ${theme === 'dark' ? 'escuro' : 'claro'}: contraste AA em todas as formas (com dados, caminho e painel aberto)`, async () => {
    const p = await newPage({ colorScheme: theme }); await p.goto(url); await seed(p);
    for (const m of MODES) {
      await pick(p, m); await p.click('[data-path="cacambas"]'); await p.evaluate(() => window.scrollTo(0, 400));
      let bad = await p.evaluate(CONTRASTE); if (shots) await p.screenshot({ path: `${shots}/${theme}-${m}.png` }); assert.deepEqual(bad, [], `${theme}/${m}`);
      await p.evaluate(() => document.querySelector('[data-stage="s4"]').click()); bad = await p.evaluate(CONTRASTE); assert.deepEqual(bad, [], `${theme}/${m} com painel`);
      await p.evaluate(() => document.querySelector('#panel button[aria-label="Fechar painel"]')?.click()); await p.click('[data-path=""]');
    } assert.deepEqual(p.errors, []); await p.context().close();
  });
  await t('responsivo: sem rolagem horizontal na página em todas as formas (360 a 1920 px)', async () => {
    for (const w of [360, 768, 1024, 1440, 1920]) { const p = await newPage({ viewport: { width: w, height: 900 } }); await p.goto(url); await seed(p);
      for (const m of MODES) { await pick(p, m); const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(o <= 0, `${w}px ${m}: rolagem horizontal ${o}px`); }
      await p.context().close(); }
  });
  await t('nenhuma forma exibe "null", "undefined" ou "NaN"', async () => {
    const p = await newPage(); await p.goto(url);
    for (const m of MODES) { await pick(p, m); const txt = await p.locator(CANVAS.includes(m) ? '#map' : '#stage-list').innerText(); assert.doesNotMatch(txt, /(^|\s)(null|undefined|NaN|false)(\s|$)/, m); } await p.context().close();
  });
  if (falhas.length) { console.log(`\nFormas: ${falhas.length} falha(s).`); process.exitCode = 1; } else console.log('\nFormas: todos os testes passaram.');
} catch (e) { console.error(`FALHOU em ${step}`, e.stack); process.exitCode = 1; } finally { await browser.close(); server.close(); }
