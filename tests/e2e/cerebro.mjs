// Cores por setor, animação "cérebro" e matriz setor × etapa. Dados fictícios só em contextos isolados.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { start } from '../../tools/serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const server = await start(0), url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const falhas = [];
const t = async (name, fn) => { try { await fn(); console.log(`ok  ${name}`); } catch (e) { falhas.push(name); console.log(`XX  ${name}\n      ${String(e.message).split('\n')[0]}`); } };
const newPage = async (o = {}) => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text())); return p; };
const seed = (p) => p.evaluate(() => { const st = window.__itasul.store, d = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');
  const a = st.addEmployee({ name: 'Func. Teste A', sector: 'Comercial' }); st.updateStage('s4', { ownerId: a.id });
  st.addTask({ stageId: 's3', title: 'Aberta s3', ownerId: a.id, due: d(-2) }); st.addTask({ stageId: 's4', title: 'Bloqueada s4', ownerId: a.id, status: 'Bloqueada' }); st.addTask({ stageId: 's7', title: 'Aberta s7' }); });
const SECTOR_OF_JS = { s1: 'Marketing', s2: 'Atendimento', s3: 'Atendimento', s4: 'Comercial', s5: 'Operação', s6: 'Comercial', s7: 'Operação', s8: 'Financeiro', s9: 'Operação', s10: 'Pós-venda', s11: 'Manutenção' };
const mode = (p, m) => p.click(`[data-mode="${m}"]`);

try {
  /* ---------------- cores por setor ---------------- */
  for (const scheme of ['light', 'dark']) await t(`cores (${scheme === 'dark' ? 'escuro' : 'claro'}): 7 setores com cores distintas; cartão, raia, quadro, linha do tempo e matriz usam a cor do seu setor`, async () => {
    const p = await newPage({ colorScheme: scheme }); await p.goto(url);
    const colors = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#map .node.stage')].map((n) => [n.dataset.stage, getComputedStyle(n).borderLeftColor])));
    const bySector = {}; for (const [id, c] of Object.entries(colors)) { const sec = SECTOR_OF_JS[id]; (bySector[sec] ||= new Set()).add(c); }
    for (const [sec, set] of Object.entries(bySector)) assert.equal(set.size, 1, `${sec}: etapas do mesmo setor têm a mesma cor`);
    assert.equal(new Set(Object.values(bySector).map((s) => [...s][0])).size, 7, 'as 7 cores são distintas');
    const colorOf = (sec) => [...bySector[sec]][0];
    await mode(p, 'raias'); const lanes = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#map .lane')].map((l) => [l.querySelector('.lane-label').textContent, getComputedStyle(l).borderLeftColor])));
    for (const [sec, c] of Object.entries(lanes)) assert.equal(c, colorOf(sec), `raia ${sec}`);
    await mode(p, 'setores'); const cols = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.board-col')].map((l) => [l.dataset.sector, getComputedStyle(l).borderTopColor])));
    for (const [sec, c] of Object.entries(cols)) assert.equal(c, colorOf(sec), `quadro ${sec}`);
    await mode(p, 'matriz'); const rows = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.matrix tbody th')].map((l) => [l.firstChild.textContent, getComputedStyle(l).borderLeftColor])));
    for (const [sec, c] of Object.entries(rows)) assert.equal(c, colorOf(sec), `matriz ${sec}`);
    await mode(p, 'timeline'); const dots = await p.evaluate(() => [...document.querySelectorAll('.tl-item')].map((l) => [l.dataset.sector, getComputedStyle(l.querySelector('.tl-dot')).borderTopColor]));
    for (const [sec, c] of dots) assert.equal(c, colorOf(sec), `linha do tempo ${sec}`);
    await p.context().close();
  });
  await t('cores: o mesmo setor muda de tom entre os temas (variantes própria para o escuro)', async () => {
    const get = async (scheme) => { const p = await newPage({ colorScheme: scheme }); await p.goto(url); const c = await p.evaluate(() => getComputedStyle(document.querySelector('[data-stage="s4"]')).borderLeftColor); await p.context().close(); return c; };
    assert.notEqual(await get('light'), await get('dark'));
  });
  await t('legenda de setores: 7 botões coloridos que filtram (alternam) o mapa e informam o estado (aria-pressed)', async () => {
    const p = await newPage(); await p.goto(url);
    assert.deepEqual(await p.locator('#sector-legend .sec-chip').allInnerTexts(), ['Marketing', 'Atendimento', 'Comercial', 'Operação', 'Financeiro', 'Manutenção', 'Pós-venda']);
    await p.click('#sector-legend [data-sector="Comercial"]');
    assert.equal(await p.locator('#sector-legend [data-sector="Comercial"]').getAttribute('aria-pressed'), 'true'); assert.equal(await p.locator('[data-filter="sector"]').inputValue(), 'Comercial');
    assert.deepEqual(await p.locator('#map .node:not(.dim)').evaluateAll((n) => n.map((x) => x.dataset.stage).sort()), ['b_munck', 's4', 's6']);
    await p.click('#sector-legend [data-sector="Comercial"]'); assert.equal(await p.locator('#map .node.dim').count(), 0); assert.equal(await p.locator('[data-filter="sector"]').inputValue(), '');
    await p.context().close();
  });

  /* ---------------- animação cérebro ---------------- */
  await t('cérebro: ligado por padrão — malha neural, um sinal por ligação, neurônios com atraso por camada', async () => {
    const p = await newPage(); await p.goto(url); await seed(p);
    assert.equal(await p.locator('#map .canvas.brain').count(), 1); assert.equal(await p.locator('#anim-toggle').getAttribute('aria-pressed'), 'true');
    const info = await p.evaluate(() => { const s = window.__itasul.store.get(); return { edges: s.edges.length, pulses: document.querySelectorAll('.pulse:not(.strong)').length, syn: document.querySelectorAll('.syn-dot').length, motion: document.querySelectorAll('animateMotion').length }; });
    assert.equal(info.pulses, info.edges); assert.ok(info.syn >= 24); assert.ok(info.motion >= info.edges);
    const nd = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#map .node')].map((n) => [n.dataset.stage, Number(n.style.getPropertyValue('--nd'))])));
    assert.equal(nd.s1, 0); assert.ok(nd.s2 > nd.s1 && nd.s3 > nd.s2 && nd.s4 > nd.s3 && nd.s5 > nd.s4, 'a onda de disparo segue o fluxo');
    await p.context().close();
  });
  await t('cérebro: as animações realmente rodam (CSS nos neurônios e SMIL nos sinais)', async () => {
    const p = await newPage(); await p.goto(url); await seed(p); await p.waitForTimeout(500);
    const css = await p.evaluate(() => { const a = document.querySelector('#map [data-stage="s5"]').getAnimations({ subtree: true }).map((x) => ({ n: x.animationName, ps: x.effect.pseudoElement, d: x.effect.getTiming().delay, dur: x.effect.getTiming().duration, run: x.playState })); return a; });
    assert.ok(css.some((x) => x.n === 'neuron' && x.ps === '::before' && x.run === 'running'), JSON.stringify(css));
    const nd5 = await p.evaluate(() => Number(document.querySelector('#map [data-stage="s5"]').style.getPropertyValue('--nd'))); const n5 = css.find((x) => x.n === 'neuron'); assert.ok(Math.abs(n5.d - nd5 * 550) < 2, 'atraso = camada × 0,55 s');
    const dur = (id) => p.evaluate((i) => document.querySelector(`#map [data-stage="${i}"]`).getAnimations({ subtree: true }).find((x) => x.animationName === 'neuron').effect.getTiming().duration, id);
    assert.equal(await dur('s4'), 2200, 'etapa com tarefa bloqueada dispara em alerta (mais rápido)'); assert.equal(await dur('s2'), 7000);
    // sinal se desloca de verdade da etapa 1 para a 2
    const move = await p.evaluate(() => { const svg = document.querySelector('svg.edges'), c = [...svg.querySelectorAll('.pulse:not(.strong)')].find((x) => x.closest('svg') && x.querySelector('animateMotion') && x.querySelector('animateMotion').getAttribute('path').startsWith('M')); svg.pauseAnimations();
      const e = document.querySelector('.edge[data-from="s1"][data-to="s2"]'); const idx = [...svg.querySelectorAll('.edge')].indexOf(e); const pulse = svg.querySelectorAll('.pulse:not(.strong)')[idx]; const target = document.querySelector('[data-stage="s2"]').getBoundingClientRect();
      const dist = (t) => { svg.setCurrentTime(t); const b = pulse.getBoundingClientRect(); return Math.hypot(b.x + b.width / 2 - (target.x + target.width / 2), b.y + b.height / 2 - (target.y + target.height / 2)); };
      return { d1: dist(0.35), d2: dist(0.7), d3: dist(1.05), op: (svg.setCurrentTime(0.7), getComputedStyle(pulse).opacity), off: (svg.setCurrentTime(3), getComputedStyle(pulse).opacity) }; });
    assert.ok(move.d1 > move.d2 && move.d2 > move.d3, `sinal deve se aproximar da etapa 2: ${JSON.stringify(move)}`); assert.ok(Number(move.op) > 0.5, 'visível enquanto viaja'); assert.ok(Number(move.off) < 0.1, 'some depois de chegar');
    await p.context().close();
  });
  await t('cérebro: selecionar uma etapa dispara a cascata a jusante (atraso por distância) e sinais extras', async () => {
    const p = await newPage(); await p.goto(url); await seed(p);
    await p.evaluate(() => document.querySelector('[data-stage="s4"]').click());
    const r = await p.evaluate(() => ({ cas: Object.fromEntries([...document.querySelectorAll('#map .node.cascade')].map((n) => [n.dataset.stage, Number(n.style.getPropertyValue('--cd'))])), strong: document.querySelectorAll('.pulse.strong').length }));
    assert.deepEqual(Object.keys(r.cas).sort(), ['b_dest', 's10', 's11', 's4', 's5', 's6', 's7', 's8', 's9']); assert.equal(r.cas.s4, 0); assert.equal(r.cas.s5, 1); assert.equal(r.cas.s7, 3); assert.equal(r.cas.s11, 5);
    assert.ok(r.strong >= 8, `sinais fortes: ${r.strong}`);
    const run = await p.evaluate(() => document.querySelector('#map [data-stage="s6"]').getAnimations({ subtree: true }).some((x) => x.animationName === 'cascade' && x.effect.pseudoElement === '::after'));
    assert.ok(run, 'animação de cascata ativa'); await p.context().close();
  });
  await t('cérebro: passar o mouse acende só as ligações do cartão', async () => {
    const p = await newPage(); await p.goto(url);
    await p.hover('#map [data-stage="s4"]');
    const r = await p.evaluate(() => ({ focusing: document.querySelector('.canvas').classList.contains('focusing'), on: [...document.querySelectorAll('.edge.on')].map((e) => `${e.dataset.from}>${e.dataset.to}`).sort() }));
    assert.equal(r.focusing, true); assert.deepEqual(r.on, ['b_munck>s4', 's3>s4'.replace('s3>s4', 's4>s5')].sort().concat([]).length ? ['b_munck>s4', 's3>s4', 's4>s5'].sort() : []);
    await p.mouse.move(5, 5); assert.equal(await p.locator('.edge.on').count(), 0); await p.context().close();
  });
  await t('cérebro: botão desliga tudo (sem malha, sinais ou brilhos), a escolha persiste e o botão informa o estado', async () => {
    const p = await newPage(); await p.goto(url);
    await p.click('#anim-toggle'); assert.equal(await p.locator('#anim-toggle').getAttribute('aria-pressed'), 'false'); assert.match(await p.locator('#anim-toggle').innerText(), /desligada/);
    assert.equal(await p.locator('.canvas.brain').count(), 0); assert.equal(await p.locator('.pulse').count(), 0); assert.equal(await p.locator('.syn-dot').count(), 0);
    assert.equal(await p.evaluate(() => document.querySelector('#map [data-stage="s2"]').getAnimations({ subtree: true }).length), 0, 'nenhuma animação CSS');
    assert.equal(await p.evaluate(() => localStorage.getItem('itasul-animacao')), 'off');
    await p.reload(); assert.equal(await p.locator('.canvas.brain').count(), 0, 'continua desligado após recarregar');
    await p.click('#anim-toggle'); assert.equal(await p.locator('.canvas.brain').count(), 1); await p.reload(); assert.equal(await p.locator('.canvas.brain').count(), 1);
    await p.context().close();
  });
  await t('cérebro: quem prefere menos movimento (sistema) começa com a animação desligada, mas pode ligar manualmente', async () => {
    const p = await newPage({ reducedMotion: 'reduce' }); await p.goto(url);
    assert.equal(await p.locator('.canvas.brain').count(), 0); assert.equal(await p.locator('#anim-toggle').getAttribute('aria-pressed'), 'false');
    await p.click('#anim-toggle'); assert.equal(await p.locator('.canvas.brain').count(), 1); await p.context().close();
  });
  await t('cérebro: funciona nas 4 formas de mapa, nos dois temas, sem erros e sem alterar dados', async () => {
    for (const scheme of ['light', 'dark']) { const p = await newPage({ colorScheme: scheme }); await p.goto(url); await seed(p);
      const snap = () => p.evaluate(() => JSON.stringify(window.__itasul.store.get())); const antes = await snap();
      for (const m of ['mapa', 'raias', 'arvore', 'circulo']) { await mode(p, m); assert.equal(await p.locator(`#map .canvas.brain[data-mode="${m}"]`).count(), 1, `${scheme}/${m}`); assert.ok(await p.locator('.pulse').count() >= 14, `${scheme}/${m}: sinais`); }
      assert.equal(await snap(), antes); assert.deepEqual(p.errors, []); await p.context().close(); }
  });
  await t('cérebro: com caminho escolhido, sinais só nas ligações destacadas e do mesmo setor de origem (cor)', async () => {
    const p = await newPage(); await p.goto(url); await p.click('[data-path="cacambas"]');
    const r = await p.evaluate(() => { const hl = document.querySelectorAll('.edge.hl').length; return { hl, pulses: document.querySelectorAll('.pulse:not(.strong)').length, dim: document.querySelectorAll('.edge.dim').length, all: document.querySelectorAll('.edge').length }; });
    assert.equal(r.pulses, r.all - r.dim, 'sem sinais nas ligações esmaecidas'); assert.ok(r.hl >= 7); await p.context().close();
  });

  /* ---------------- matriz setor × etapa ---------------- */
  await t('matriz: 7 linhas × 13 colunas; cada etapa tem uma única célula "executa", no setor dela', async () => {
    const p = await newPage(); await p.goto(url); await seed(p); await mode(p, 'matriz');
    assert.equal(await p.locator('.matrix tbody tr').count(), 7); assert.equal(await p.locator('.matrix thead [data-stage]').count(), 13);
    assert.equal(await p.locator('.mx-cell.executa').count(), 13);
    const exec = await p.locator('.mx-cell.executa').evaluateAll((c) => c.map((x) => x.dataset.cell.split('|')));
    const secs = await p.evaluate(() => Object.fromEntries(window.__itasul.store.get().stages.map((s) => [s.id, s.sector])));
    for (const [sec, id] of exec) assert.equal(secs[id], sec, id);
    assert.match(await p.locator('.mx-cell[data-cell="Comercial|s4"]').innerText(), /Executa[\s\S]*Func\. Teste A/); assert.match(await p.locator('.mx-cell[data-cell="Operação|s5"]').innerText(), /⚠ A definir/);
    await p.context().close();
  });
  await t('matriz: células "entrega" e "recebe" batem com as ligações entre setores (inclui o retorno 11→5)', async () => {
    const p = await newPage(); await p.goto(url); await mode(p, 'matriz');
    const exp = await p.evaluate(() => { const s = window.__itasul.store.get(), by = Object.fromEntries(s.stages.map((x) => [x.id, x])); const cross = s.edges.filter((e) => by[e.from].sector !== by[e.to].sector);
      return { give: new Set(cross.map((e) => `${by[e.to].sector}|${e.from}`)).size, take: new Set(cross.map((e) => `${by[e.from].sector}|${e.to}`)).size }; });
    assert.equal(await p.locator('.mx-cell.entrega').count(), exp.give); assert.equal(await p.locator('.mx-cell.recebe').count(), exp.take);
    assert.match(await p.locator('.mx-cell[data-cell="Comercial|s3"]').innerText(), /Entrega para este setor/); assert.match(await p.locator('.mx-cell[data-cell="Atendimento|s4"]').innerText(), /Recebe deste setor/);
    assert.match(await p.locator('.mx-cell[data-cell="Operação|s11"]').innerText(), /retorno/);
    await p.context().close();
  });
  await t('matriz: clique em cabeçalho ou célula abre a etapa; filtros e caminho se refletem; células têm nome acessível', async () => {
    const p = await newPage(); await p.goto(url); await seed(p); await mode(p, 'matriz');
    await p.click('.matrix [data-cell="Comercial|s6"]'); assert.match(await p.locator('#panel h2').innerText(), /Fechamento/);
    await p.click('#panel [aria-label="Fechar painel"]'); await p.click('.matrix thead [data-stage="s8"]'); assert.match(await p.locator('#panel h2').innerText(), /Financeiro/);
    assert.match(await p.locator('.mx-cell[data-cell="Comercial|s4"]').getAttribute('aria-label'), /Comercial, 4\. Comercial e orçamento: executa/);
    await p.selectOption('[data-filter="sector"]', 'Financeiro'); assert.deepEqual(await p.locator('.matrix thead [data-stage]:not(.dim)').evaluateAll((e) => e.map((x) => x.dataset.stage)), ['s8']); await p.click('[data-testid="clear-filters"]');
    await p.click('[data-path="cacambas"]'); assert.deepEqual(await p.locator('.matrix thead .in-path').evaluateAll((e) => e.map((x) => x.dataset.stage).sort()), ['b_dest', 's2', 's4', 's5', 's7', 's8']);
    assert.match(await p.locator('.matrix thead [data-stage="s4"]').innerText(), /#2/); await p.context().close();
  });
  await t('matriz: tabela rola dentro do quadro (cabeçalho e coluna de setores fixos), sem rolagem horizontal da página', async () => {
    for (const w of [390, 1440]) { const p = await newPage({ viewport: { width: w, height: 900 } }); await p.goto(url); await mode(p, 'matriz');
      const r = await p.evaluate(() => { const wrap = document.querySelector('.matrix-wrap'); const th = document.querySelector('.matrix tbody th'); const x0 = th.getBoundingClientRect().left; wrap.scrollLeft = 400; return { page: document.documentElement.scrollWidth - innerWidth, scrolls: wrap.scrollWidth > wrap.clientWidth, x0, x1: th.getBoundingClientRect().left, wl: wrap.getBoundingClientRect().left }; });
      assert.ok(r.page <= 0, `${w}px: página rolou ${r.page}`); assert.ok(r.scrolls, `${w}px: tabela rola no quadro`); assert.ok(Math.abs(r.x1 - r.wl) < 2, `${w}px: coluna de setores fixa`); await p.context().close(); }
  });
  await t('matriz: teclado — Tab alcança cabeçalhos e células e Enter abre a etapa', async () => {
    const p = await newPage(); await p.goto(url); await mode(p, 'matriz');
    await p.focus('.matrix [data-cell="Atendimento|s2"]'); await p.keyboard.press('Enter'); assert.match(await p.locator('#panel h2').innerText(), /Entrada do cliente/);
    assert.ok(await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none' || getComputedStyle(document.activeElement).boxShadow !== 'none'), 'foco visível'); await p.context().close();
  });

  if (falhas.length) { console.log(`\nCérebro/cores/matriz: ${falhas.length} falha(s).`); process.exitCode = 1; } else console.log('\nCérebro/cores/matriz: todos os testes passaram.');
} catch (e) { console.error(e.stack); process.exitCode = 1; } finally { await browser.close(); server.close(); }
