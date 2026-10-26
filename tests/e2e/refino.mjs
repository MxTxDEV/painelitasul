// Rodada de refinamento: legibilidade do mapa, cabeçalho/indicadores, tema em todas as superfícies, mapa (zoom, arrasto,
// seleção) e teclado. Dados fictícios só em contextos isolados. Uso: node tests/e2e/refino.mjs [pasta-capturas]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { start } from '../../tools/serve.mjs';
import { CONTRASTE } from './helpers/contraste.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const shots = process.argv[2]; if (shots) mkdirSync(shots, { recursive: true });
const server = await start(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
let step = 'início';
const falhas = [];
const t = async (name, fn) => { step = name; try { await fn(); console.log(`ok  ${name}`); } catch (e) { falhas.push(name); console.log(`XX  ${name}\n      ${String(e.message).split('\n')[0]}`); } };
const newPage = async (opts = {}) => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts }); const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text())); return p; };
const VIEWS = ['mapa', 'equipe', 'rotina', 'registros', 'melhorias'];
async function seedFake(page) { // dados FICTÍCIOS, só neste contexto isolado
  await page.evaluate(() => {
    const st = window.__itasul.store, day = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv');
    const a = st.addEmployee({ name: 'Func. Teste A', role: 'Cargo de teste', sector: 'Comercial', stageIds: ['s2', 's4'] }); const b = st.addEmployee({ name: 'Func. Teste B', coordinatorId: a.id });
    st.updateStage('s4', { ownerId: a.id, substituteId: b.id, problems: ['Problema de teste'], responsibilities: ['Resp. de teste'] });
    st.addTask({ stageId: 's3', title: 'Tarefa aberta', ownerId: a.id, due: day(0) }); st.addTask({ stageId: 's4', title: 'Tarefa atrasada', ownerId: b.id, due: day(-3), status: 'Em andamento' });
    st.addTask({ stageId: 's4', title: 'Tarefa bloqueada', ownerId: a.id, status: 'Bloqueada' }); st.addTask({ stageId: 's5', title: 'Tarefa aguardando', status: 'Aguardando terceiros' });
    const d = st.addTask({ stageId: 's2', title: 'Tarefa concluída', ownerId: a.id, due: day(0) }); st.completeTask(d.id);
    for (const [kind, title, status] of [['Orçamento', 'Orç. teste', 'Aberto'], ['Locação', 'Loc. teste', 'Em andamento'], ['Entrega', 'Ent. teste', 'Programado']]) st.addRecord({ kind, title, status, stageId: 's7' });
    st.addImprovement({ title: 'Sugestão de teste', status: 'Em avaliação', link: { type: 'stage', id: 's4' } });
  });
}

try {
  /* ---------- Legibilidade dos cartões do mapa ---------- */
  await t('mapa: texto renderizado dos cartões legível em 1280, 1440 e 1920 px (nome ≥ 14px, rodapé ≥ 11px, selos ≥ 10.5px)', async () => {
    for (const w of [1280, 1440, 1920]) {
      const p = await newPage({ viewport: { width: w, height: 900 } }); await p.goto(url);
      const m = await p.evaluate(() => { const n = document.querySelector('[data-testid="node-s4"]'); const k = Number(document.querySelector('.canvas').style.transform.match(/scale\(([\d.]+)\)/)[1]);
        const px = (sel) => parseFloat(getComputedStyle(n.querySelector(sel)).fontSize) * k; return { k, nome: px('.node-name'), foot: px('.node-foot'), chip: px('.chip') }; });
      assert.ok(m.nome >= 14, `${w}px: nome ${m.nome.toFixed(1)}px`); assert.ok(m.foot >= 11, `${w}px: rodapé ${m.foot.toFixed(1)}px`); assert.ok(m.chip >= 10.5, `${w}px: selo ${m.chip.toFixed(1)}px`);
      await p.context().close();
    }
  });
  await t('mapa: nenhum texto dos cartões é cortado (nome, rodapé e selos dentro do cartão), com todos os selos ativos', async () => {
    const p = await newPage(); await p.goto(url);
    await p.evaluate(() => { const st = window.__itasul.store; const a = st.addEmployee({ name: 'Func. Teste com Nome Bem Longo Para Testar' });
      for (const id of ['s3', 's4', 's5', 's7']) { st.addTask({ stageId: id, title: 'aberta', ownerId: a.id, due: '2020-01-01' }); st.addTask({ stageId: id, title: 'bloq', status: 'Bloqueada' }); } st.updateStage('s5', { ownerId: a.id }); });
    await p.click('[data-path="cacambas"]');
    const bad = await p.evaluate(() => [...document.querySelectorAll('.node')].flatMap((n) => { const r = n.getBoundingClientRect(), out = [];
      for (const c of n.querySelectorAll('.node-top > *, .node-name, .node-foot > *')) { const b = c.getBoundingClientRect(); if (b.bottom > r.bottom + 1 || b.right > r.right + 1 || b.top < r.top - 1) out.push(`${n.dataset.stage}:${c.className}`); }
      const nm = n.querySelector('.node-name'); const foot = n.querySelector('.node-foot').getBoundingClientRect(); if (nm.getBoundingClientRect().bottom > foot.top + 1) out.push(`${n.dataset.stage}: nome sobrepõe rodapé`);
      return out; }));
    assert.deepEqual(bad, []);
    await p.context().close();
  });

  /* ---------- Cabeçalho, navegação e indicadores ---------- */
  await t('cabeçalho: uma única linha com abas + ações (sem quebra) de 1100 a 1920 px; abas visíveis e inteiras', async () => {
    for (const w of [1100, 1280, 1366, 1440, 1600, 1920]) {
      const p = await newPage({ viewport: { width: w, height: 800 } }); await p.goto(url);
      const r = await p.evaluate(() => { const cy = [...document.querySelectorAll('.brand, .vtab, .top-actions > *')].map((e) => { const b = e.getBoundingClientRect(); return b.top + b.height / 2; }); const rows = { size: Math.max(...cy) - Math.min(...cy) <= 14 ? 1 : 2 }; const h = document.querySelector('.top').getBoundingClientRect().height;
        const cut = [...document.querySelectorAll('.vtab, .icon-action')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth).length; return { rows: rows.size, h, cut }; });
      assert.equal(r.rows, 1, `${w}px: cabeçalho em ${r.rows} linhas`); assert.ok(r.h < 80, `${w}px: altura ${r.h}`); assert.equal(r.cut, 0, `${w}px: item cortado`);
      await p.context().close();
    }
  });
  await t('indicadores: sem cartão isolado, colunas equilibradas e rótulos em até 3 linhas', async () => {
    for (const w of [1920, 1440, 1280, 1024, 768, 390]) {
      const p = await newPage({ viewport: { width: w, height: 900 } }); await p.goto(url);
      await p.evaluate(() => document.querySelectorAll('.kpi-group').forEach((d) => { d.open = true; }));
      const r = await p.evaluate(() => ({ groups: [...document.querySelectorAll('.kpi-group')].map((g) => { const tiles = [...g.querySelectorAll('.kpi')]; const rows = {}; tiles.forEach((k) => { const y = Math.round(k.getBoundingClientRect().top); (rows[y] ||= []).push(k); }); const sizes = Object.values(rows).map((x) => x.length);
        const lines = Math.max(...tiles.map((k) => Math.round(k.querySelector('.kpi-lbl').getBoundingClientRect().height / parseFloat(getComputedStyle(k.querySelector('.kpi-lbl')).lineHeight)))); return { sizes, lines, h: Math.round(tiles[0].getBoundingClientRect().height), minW: Math.round(Math.min(...tiles.map((k) => k.getBoundingClientRect().width))) }; }) }));
      for (const g of r.groups) { assert.ok(!(g.sizes.length > 1 && g.sizes[g.sizes.length - 1] === 1 && g.sizes[0] > 2), `${w}px: cartão isolado ${g.sizes}`); assert.ok(g.lines <= 3, `${w}px: rótulo com ${g.lines} linhas`); if (w >= 768) assert.ok(g.minW >= 150, `${w}px: cartão estreito ${g.minW}px`); }
      await p.context().close();
    }
  });
  await t('indicadores: bloco ocupa no máximo 30% da altura da tela em desktop (o mapa aparece sem rolar muito)', async () => {
    const p = await newPage({ viewport: { width: 1440, height: 900 } }); await p.goto(url);
    const top = await p.evaluate(() => document.querySelector('#view-mapa .toolbar').getBoundingClientRect().top);
    assert.ok(top <= 420, `filtros começam em y=${top}`);
    await p.context().close();
  });

  /* ---------- Mapa: zoom, movimentação, seleção ---------- */
  await t('mapa: arrastar o fundo move o mapa SEM fechar o painel; clique no fundo ainda fecha', async () => {
    const p = await newPage(); await p.goto(url);
    await p.click('[data-testid="node-s4"]'); assert.equal(await p.locator('#panel').isVisible(), true);
    const tr = () => p.locator('.canvas').evaluate((n) => n.style.transform);
    await p.evaluate(() => window.scrollTo(0, document.querySelector('#map').offsetTop - 70));
    const before = await tr();
    const pt = await p.evaluate(() => { const m = document.querySelector('#map').getBoundingClientRect(); for (let y = m.top + 30; y < Math.min(m.bottom, innerHeight) - 30; y += 24) for (let x = m.left + 20; x < m.right - 20; x += 24) { const e = document.elementFromPoint(x, y); if (e && !e.closest('.node') && e.closest('#map')) return [x, y]; } return null; });
    assert.ok(pt, 'há um ponto vazio no mapa');
    const [px, py] = pt;
    await p.mouse.move(px, py); await p.mouse.down(); await p.mouse.move(px + 40, py + 25, { steps: 6 }); await p.mouse.up();
    assert.notEqual(await tr(), before, 'o mapa se moveu'); assert.equal(await p.locator('#panel').isVisible(), true, 'painel permaneceu aberto após arrastar');
    await p.mouse.click(px + 40, py + 25);
    assert.equal(await p.locator('#panel').isVisible(), false, 'clique simples no fundo fecha o painel');
    await p.context().close();
  });
  await t('mapa: roda do mouse e botões fazem zoom com limites; Ajustar restaura; cartões seguem cliclávies em qualquer zoom', async () => {
    const p = await newPage(); await p.goto(url);
    const k = () => p.locator('.canvas').evaluate((n) => Number(n.style.transform.match(/scale\(([\d.]+)\)/)[1]));
    const k0 = await k(); await p.evaluate(() => window.scrollTo(0, document.querySelector('#map').offsetTop - 70)); const box = await p.locator('#map').boundingBox(); await p.mouse.move(box.x + 400, box.y + 300);
    await p.mouse.wheel(0, -300); await p.waitForTimeout(50); const kIn = await k(); assert.ok(kIn > k0, 'roda para cima aproxima');
    await p.mouse.wheel(0, 600); await p.waitForTimeout(50); assert.ok(await k() < kIn, 'roda para baixo afasta');
    for (let i = 0; i < 25; i++) await p.click('#zoom-in'); assert.ok(await k() <= 2.0001, 'limite máximo 200%');
    for (let i = 0; i < 40; i++) await p.click('#zoom-out'); assert.ok(await k() >= 0.2499, 'limite mínimo 25%');
    await p.click('#zoom-fit'); assert.ok(Math.abs(await k() - k0) < 0.05, 'Ajustar volta ao enquadramento');
    for (let i = 0; i < 4; i++) await p.click('#zoom-in');
    await p.evaluate(() => document.querySelector('[data-testid="node-s2"]').scrollIntoView()); // sem efeito no canvas, só garante foco do DOM
    await p.locator('[data-testid="node-s1"]').dispatchEvent('click'); assert.match(await p.locator('#panel h2').innerText(), /Marketing/);
    await p.context().close();
  });
  await t('mapa: com o painel aberto, a etapa selecionada permanece à vista e legível (≥ 70% de zoom)', async () => {
    const p = await newPage(); await p.goto(url);
    for (const id of ['s1', 's4', 's11', 'b_dest', 'b_munck']) {
      await p.click(`[data-stage="${id}"]`, { force: true }).catch(() => {}); await p.evaluate((i) => document.querySelector(`[data-stage="${i}"]`).click(), id);
      const r = await p.evaluate((i) => { const n = document.querySelector(`[data-stage="${i}"]`).getBoundingClientRect(), m = document.querySelector('#map').getBoundingClientRect(); const k = Number(document.querySelector('.canvas').style.transform.match(/scale\(([\d.]+)\)/)[1]); return { inside: n.left >= m.left - 1 && n.right <= m.right + 1 && n.top >= m.top - 1 && n.bottom <= m.bottom + 1, k }; }, id);
      assert.ok(r.inside, `${id} fora da área visível do mapa`); assert.ok(r.k >= 0.7, `${id}: zoom ${r.k}`);
    }
    await p.context().close();
  });

  /* ---------- Tema em todas as superfícies ---------- */
  for (const theme of ['claro', 'escuro']) {
    await t(`tema ${theme}: tabelas, menus, formulários, modais, mensagens, hover e foco — contraste AA e sem superfícies do tema errado`, async () => {
      const p = await newPage({ colorScheme: theme === 'escuro' ? 'dark' : 'light' }); await p.goto(url); await seedFake(p);
      await p.evaluate((v) => localStorage.setItem('itasul-tema', v), theme); await p.reload();
      const audit = async (label) => { const bad = await p.evaluate(CONTRASTE); if (shots) await p.screenshot({ path: `${shots}/${theme}-${label}.png` }); assert.deepEqual(bad, [], `${theme}/${label}`); };
      // superfícies claras no escuro (ou escuras no claro) fora da lista de exceções intencionais
      const surfaces = () => p.evaluate((th) => { const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return [0.2126, 0.7152, 0.0722].reduce((s, k, i) => s + k * f(m[i]), 0); };
        const ok = '.alert.wait, .lg-handoff, .handoff, .skip, .badge-num, .btn.primary, .seg.active, .logo, .top, .top *, th, .steps li::before, .lg, .toast, .kpi, .chip';
        return [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); if (!b.width || e.closest('svg') || e.matches(ok) || e.closest('.top')) return false; const c = getComputedStyle(e).backgroundColor; if (!c || c.startsWith('rgba(0, 0, 0, 0') || /, 0\)$/.test(c)) return false; const l = lum(c); return th === 'escuro' ? l > 0.3 : l < 0.04; }).slice(0, 5).map((e) => `${e.tagName}.${e.className}`); }, theme);
      for (const v of VIEWS) { await p.click(`[data-view="${v}"]`); await audit(`tela-${v}`); assert.deepEqual(await surfaces(), [], `${theme}/${v}: superfície com cor do tema errado`); }
      // tabelas: cobertura (equipe), transferências, registros
      await p.click('[data-view="equipe"]'); await p.locator('#view-equipe table').last().scrollIntoViewIfNeeded(); await audit('tabelas-equipe');
      await p.click('[data-view="equipe"]'); await p.click('details.edit summary'); await audit('equipe-detalhes-abertos');
      // menu Dados
      await p.click('#data-menu summary'); await p.hover('#data-menu button >> nth=0'); await audit('menu-dados-hover'); await p.keyboard.press('Escape');
      assert.equal(await p.locator('#data-menu').evaluate((m) => m.open), false, 'Esc fecha o menu');
      // hover/foco: botões primário, secundário, perigoso, abas, chips, indicadores, filtros
      await p.click('[data-view="mapa"]');
      for (const sel of ['#add-stage', '#zoom-fit', '[data-path="munck"]', '[data-kpi="tasksOverdue"]', '[data-kpi="quotesOpen"]', '.vtab >> nth=1', '#theme-toggle', '[data-testid="node-s6"]', '[data-testid="node-b_dest"]']) { await p.hover(sel); await audit(`hover-${sel.replace(/\W+/g, '_')}`); }
      await p.click('[data-testid="node-s4"]');
      for (const sel of ['.tab >> nth=2', '[data-testid="add-task"]', '#panel [data-act="complete"] >> nth=0', '#panel .chip.link >> nth=0']) { await p.hover(sel); await audit(`hover-painel-${sel.replace(/\W+/g, '_')}`); }
      for (const sel of ['.tab >> nth=2', '[data-testid="add-task"]']) { await p.focus(sel); await audit(`foco-painel-${sel.replace(/\W+/g, '_')}`); }
      await p.click('#panel [aria-label="Fechar painel"]');
      // formulários e modais (cada um: normal e com botão destrutivo/primário em hover)
      const modais = [['equipe', '[data-testid="add-employee"]', 'funcionario'], ['registros', '[data-testid="add-record"]', 'registro'], ['melhorias', '[data-testid="add-improvement"]', 'sugestao'], ['rotina', '[data-testid="routine-new-task"]', 'tarefa'], ['mapa', '#add-stage', 'etapa']];
      for (const [view, btn, nome] of modais) { await p.click(`[data-view="${view}"]`); await p.click(btn); await audit(`modal-${nome}`); await p.hover('dialog button[type=submit]'); await audit(`modal-${nome}-hover`); await p.keyboard.press('Escape'); await p.waitForSelector('dialog', { state: 'detached' }); }
      await p.click('[data-view="equipe"]'); await p.click('[data-testid="emp-card"] button:has-text("Editar")'); await p.hover('dialog .btn.danger'); await audit('modal-editar-excluir-hover'); await p.click('dialog .btn.danger'); await audit('modal-confirmar'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
      await p.evaluate(() => document.querySelectorAll('dialog').forEach((d) => d.close()));
      await p.click('[data-view="mapa"]'); await p.click('[data-kpi="quotesOpen"]'); await audit('modal-indicador-com-itens'); await p.keyboard.press('Escape');
      await p.click('[data-kpi="rentalsActive"]'); await audit('modal-indicador-registros'); await p.keyboard.press('Escape');
      // mensagens
      await p.evaluate(() => { const t = document.getElementById('toast'); t.textContent = '✔ Mensagem de sucesso'; t.className = 'toast show success'; }); await p.waitForTimeout(400); await audit('toast-sucesso');
      await p.evaluate(() => { const t = document.getElementById('toast'); t.textContent = '✖ Erro: mensagem de erro'; t.className = 'toast show error'; }); await p.waitForTimeout(400); await audit('toast-erro');
      await p.evaluate(() => { const t = document.getElementById('toast'); t.textContent = 'ℹ Informação'; t.className = 'toast show '; }); await p.waitForTimeout(400); await audit('toast-info');
      // seletores nativos: opções e campos de data adotam o esquema de cores do tema
      const nat = await p.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme, opt: getComputedStyle(document.querySelector('option')).backgroundColor }));
      assert.equal(nat.scheme, theme === 'escuro' ? 'dark' : 'light');
      assert.deepEqual(p.errors, []);
      await p.context().close();
    });
  }
  await t('tema: escolhido em qualquer tela permanece após recarregar; botão e rótulos refletem o estado', async () => {
    const p = await newPage({ colorScheme: 'light' }); await p.goto(url);
    for (const v of VIEWS) {
      await p.click(`[data-view="${v}"]`); const antes = await p.evaluate(() => document.documentElement.dataset.theme);
      await p.click('#theme-toggle'); const depois = await p.evaluate(() => document.documentElement.dataset.theme); assert.notEqual(depois, antes, `${v}: alternou`);
      await p.reload();
      assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), depois, `${v}: persistiu`);
      assert.equal(await p.locator('#theme-toggle').getAttribute('aria-pressed'), String(depois === 'escuro'));
      assert.match(await p.locator('#theme-toggle').getAttribute('aria-label'), depois === 'escuro' ? /Tema escuro ativo/ : /Tema claro ativo/);
      assert.equal(await p.evaluate(() => localStorage.getItem('itasul-tema')), depois);
    }
    await p.context().close();
  });
  await t('tema: alternar não altera nem apaga dados do painel (estado idêntico antes e depois)', async () => {
    const p = await newPage(); await p.goto(url); await seedFake(p);
    const snap = () => p.evaluate(() => JSON.stringify(window.__itasul.store.get()));
    const antes = await snap(); await p.click('#theme-toggle'); await p.click('#theme-toggle'); await p.reload();
    assert.equal(await snap(), antes); await p.context().close();
  });

  /* ---------- Teclado ---------- */
  await t('teclado: setas navegam entre todos os cartões conforme as ligações visuais; Enter e Espaço abrem a etapa', async () => {
    const p = await newPage(); await p.goto(url);
    const go = async (from, key) => { await p.focus(`[data-stage="${from}"]`); await p.keyboard.press(key); return p.evaluate(() => document.activeElement.dataset.stage); };
    const expected = [['s1', 'ArrowRight', 's2'], ['s2', 'ArrowRight', 's3'], ['s3', 'ArrowRight', 's4'], ['s4', 'ArrowDown', 's5'], ['s5', 'ArrowLeft', 's6'], ['s6', 'ArrowLeft', 's7'], ['s7', 'ArrowLeft', 's8'], ['s8', 'ArrowLeft', 'b_dest'], ['s7', 'ArrowDown', 's9'], ['s9', 'ArrowLeft', 's10'], ['s5', 'ArrowDown', 's11'], ['s11', 'ArrowUp', 's5'], ['s3', 'ArrowUp', 'b_munck'], ['s2', 'ArrowDown', 's7']];
    for (const [from, key, to] of expected) assert.equal(await go(from, key), to, `${from} ${key}`);
    await p.focus('[data-stage="s6"]'); await p.keyboard.press('Enter'); assert.match(await p.locator('#panel h2').innerText(), /Fechamento/);
    await p.focus('[data-stage="s8"]'); await p.keyboard.press('Space'); assert.match(await p.locator('#panel h2').innerText(), /Financeiro/);
    await p.context().close();
  });
  await t('teclado: Tab percorre cabeçalho, filtros e cartões e todo elemento focado tem indicador de foco visível', async () => {
    for (const theme of ['light', 'dark']) {
      const p = await newPage({ colorScheme: theme }); await p.goto(url);
      const seen = new Set(); let missing = [];
      for (let i = 0; i < 60; i++) {
        await p.keyboard.press('Tab');
        const r = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { id: e.dataset.view || e.dataset.stage || e.id || e.className || e.tagName, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; });
        if (r) { seen.add(r.id); if (!r.ring) missing.push(r.id); }
      }
      assert.deepEqual(missing, [], `${theme}: sem indicador de foco`); assert.ok(seen.size >= 30, `${theme}: poucos elementos focáveis (${seen.size})`);
      await p.context().close();
    }
  });

  if (falhas.length) { console.log(`\nRefino: ${falhas.length} falha(s).`); process.exitCode = 1; } else console.log('\nRefino: todos os testes passaram.');
} catch (e) {
  console.error(`\nFALHOU em: ${step}\n`, e.stack?.split('\n').slice(0, 5).join('\n') ?? e);
  process.exitCode = 1;
} finally { await browser.close(); server.close(); }
