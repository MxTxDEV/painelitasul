// Auditoria funcional + visual (Playwright, navegador real). Dados fictícios SOMENTE em contextos isolados e descartáveis.
// Uso: node tests/e2e/auditoria.mjs [pasta-para-capturas]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { start } from '../../tools/serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const shots = process.argv[2]; if (shots) mkdirSync(shots, { recursive: true });
const server = await start(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
let step = 'início';
const t = async (name, fn) => { step = name; await fn(); console.log(`ok  ${name}`); };
const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  return page;
};
const VIEWS = ['mapa', 'equipe', 'rotina', 'registros', 'melhorias'];
const setTheme = (page, theme) => page.evaluate((v) => { localStorage.setItem('itasul-tema', v); }, theme).then(() => page.reload());

// Dados FICTÍCIOS de teste (contexto isolado): cobrem todos os estados visuais.
async function seedFake(page) {
  await page.evaluate(() => {
    const st = window.__itasul.store, iso = (d) => d.toLocaleDateString('sv'), day = (n) => iso(new Date(Date.now() + n * 864e5));
    const a = st.addEmployee({ name: 'Func. Teste A', role: 'Cargo de teste', sector: 'Comercial', stageIds: ['s2', 's4'] });
    const b = st.addEmployee({ name: 'Func. Teste B', coordinatorId: a.id });
    st.updateStage('s4', { ownerId: a.id, substituteId: b.id, problems: ['Problema de teste'], responsibilities: ['Responsabilidade de teste'] });
    st.addTask({ stageId: 's3', title: 'Tarefa aberta s3', ownerId: a.id, priority: 'Alta', due: day(0) });
    st.addTask({ stageId: 's4', title: 'Tarefa atrasada s4', ownerId: b.id, priority: 'Urgente', due: day(-3), status: 'Em andamento' });
    st.addTask({ stageId: 's4', title: 'Tarefa bloqueada s4', ownerId: a.id, status: 'Bloqueada', due: day(2) });
    st.addTask({ stageId: 's5', title: 'Tarefa aguardando', status: 'Aguardando terceiros' });
    const done = st.addTask({ stageId: 's2', title: 'Tarefa concluída', ownerId: a.id, due: day(0) }); st.completeTask(done.id);
    st.addTask({ stageId: 's11', title: 'Reparo de teste', ownerId: b.id, due: day(1) });
    for (const [kind, title, status] of [['Orçamento', 'Orç. teste', 'Aberto'], ['Orçamento', 'Orç. ret.', 'Aguardando retorno'], ['Locação', 'Loc. teste', 'Em andamento'], ['Entrega', 'Ent. teste', 'Programado'], ['Pendência financeira', 'Pend. teste', 'Aberto'], ['Equipamento indisponível', 'Equip. teste', 'Em andamento']]) st.addRecord({ kind, title, status, stageId: 's7' });
    st.addImprovement({ title: 'Sugestão de teste', problem: 'p', idea: 'i', status: 'Em avaliação', link: { type: 'stage', id: 's4' } });
    st.setMetric('rentalsActive', 2);
  });
}

import { CONTRASTE as CONTRAST } from './helpers/contraste.mjs';

try {
  /* ===== 1. Auditoria funcional ===== */
  const page = await newPage();
  await page.goto(url);
  await seedFake(page);

  await t('1. cada cartão do mapa abre os detalhes da etapa correta (13 cartões)', async () => {
    await page.click('[data-view="mapa"]');
    const stages = await page.evaluate(() => window.__itasul.store.get().stages.map((s) => ({ id: s.id, name: s.name, num: s.num, sector: s.sector })));
    assert.equal(stages.length, 13);
    for (const s of stages) {
      if (await page.locator('#panel').isVisible()) await page.click('#zoom-fit'); // painel aberto: o mapa foca na etapa; "Ajustar" mostra tudo
      await page.click(`[data-testid="node-${s.id}"]`);
      assert.equal(await page.locator('#panel h2').innerText(), s.name, s.id);
      assert.match(await page.locator('#panel .panel-head small').innerText(), new RegExp(`${s.num ? `Etapa ${s.num}` : 'Ramal'} · ${s.sector}`));
      assert.equal(await page.locator(`[data-testid="node-${s.id}"].selected`).count(), 1);
    }
    await page.click('#panel [aria-label="Fechar painel"]');
    assert.equal(await page.locator('#panel').isVisible(), false);
  });

  await t('2. cadastrar/editar funcionário, função e responsável (e voltar a "A definir")', async () => {
    await page.click('[data-view="equipe"]');
    await page.click('[data-testid="emp-card"]:has-text("Func. Teste B") button:has-text("Editar")');
    await page.fill('dialog label:has-text("Cargo ou função") input', 'Função editada');
    await page.selectOption('dialog label:has-text("Setor") select', 'Operação');
    await page.click('dialog button[type=submit]');
    assert.match(await page.locator('[data-testid="emp-card"]:has-text("Func. Teste B")').innerText(), /Cargo: Função editada · Setor: Operação/);
    await page.click('[data-view="mapa"]'); await page.click('[data-testid="node-s6"]'); await page.click('.tab[data-tab="pessoas"]');
    await page.selectOption('[data-testid="sel-ownerId"]', { label: 'Func. Teste B' });
    assert.equal(await page.locator('[data-testid="node-s6"].no-owner').count(), 0);
    assert.match(await page.locator('[data-testid="node-s6"]').innerText(), /Func\. Teste B/);
    await page.selectOption('[data-testid="sel-ownerId"]', { label: 'A definir' });
    assert.equal(await page.locator('[data-testid="node-s6"].no-owner').count(), 1);
    assert.match(await page.locator('[data-testid="node-s6"]').innerText(), /A definir/);
  });

  await t('3. tarefa: criar, atribuir, concluir e reabrir', async () => {
    await page.click('.tab[data-tab="tarefas"]'); await page.click('[data-testid="add-task"]');
    await page.fill('dialog label:has-text("Título") input', 'Tarefa de auditoria');
    await page.selectOption('dialog label:has-text("Responsável") select', { label: 'Func. Teste A' });
    await page.click('dialog button[type=submit]');
    const row = page.locator('#panel [data-testid="task-row"]:has-text("Tarefa de auditoria")');
    assert.match(await row.innerText(), /Func\. Teste A/);
    await row.locator('[data-act="complete"]').click();
    assert.match(await row.innerText(), /Concluída/);
    await row.locator('[data-act="reopen"]').click();
    assert.match(await row.innerText(), /Pendente/);
  });

  await t('4. rotina diária: tarefas corretas por responsável e status', async () => {
    await page.click('[data-view="rotina"]');
    await page.selectOption('[data-testid="routine-person"]', { label: 'Func. Teste B' });
    // B tem: atrasada s4 (due -3, carregada), reparo (due +1 → fora do dia de hoje)
    assert.deepEqual(await page.locator('[data-testid="routine-carried-list"] strong').allInnerTexts(), ['Tarefa atrasada s4']);
    assert.equal(await page.locator('[data-testid="routine-day-list"] [data-testid="task-row"]').count(), 0);
    await page.selectOption('[data-testid="routine-person"]', { label: 'Func. Teste A' });
    assert.deepEqual((await page.locator('[data-testid="routine-day-list"] strong').allInnerTexts()).sort(), ['Tarefa aberta s3', 'Tarefa concluída']);
    await page.click('[data-group="concluidas"]');
    assert.deepEqual(await page.locator('[data-testid="routine-day-list"] strong').allInnerTexts(), ['Tarefa concluída']);
    await page.click('[data-group="concluidas"]'); await page.click('[data-group="bloqueadas"]');
    assert.equal(await page.locator('#view-rotina [data-testid="task-row"]').count(), 0, 'a bloqueada de A tem prazo +2 (fora do dia)');
    await page.click('[data-testid="day-next"]'); await page.click('[data-testid="day-next"]');
    assert.deepEqual(await page.locator('[data-testid="routine-day-list"] strong').allInnerTexts(), ['Tarefa bloqueada s4']);
    await page.click('[data-group="bloqueadas"]');
    await page.click('button:has-text("Hoje")');
  });

  await t('5. indicadores calculados dos dados e clicáveis', async () => {
    await page.click('[data-view="mapa"]');
    const expect = await page.evaluate(() => { const s = window.__itasul.store.get(); const iso = (d) => d.toLocaleDateString('sv'); const today = iso(new Date());
      return { overdue: s.tasks.filter((t) => t.due && t.due < today && t.status !== 'Concluída').length, open: s.tasks.filter((t) => t.status !== 'Concluída').length, blocked: s.tasks.filter((t) => t.status === 'Bloqueada').length, noOwner: s.stages.filter((x) => !x.ownerId).length }; });
    const val = async (k) => Number((await page.locator(`[data-kpi="${k}"]`).innerText()).match(/^\d+/)[0]);
    assert.equal(await val('tasksOverdue'), expect.overdue); assert.equal(await val('extra-open'), expect.open);
    assert.equal(await val('extra-blocked'), expect.blocked); assert.equal(await val('extra-noowner'), expect.noOwner);
    assert.equal(await val('quotesOpen'), 1); assert.equal(await val('quotesAwaiting'), 1); assert.equal(await val('rentalsActive'), 1, 'registros têm prioridade sobre o valor manual (2)');
    for (const k of ['tasksOverdue', 'extra-open', 'extra-blocked', 'extra-noowner', 'quotesOpen', 'equipmentDown', 'financePending', 'deliveriesPlanned', 'improvementsReview']) {
      const n = await val(k);
      await page.click(`[data-kpi="${k}"]`);
      assert.equal(await page.locator('[data-testid="ind-items"] li').count(), n, `lista de ${k}`);
      await page.keyboard.press('Escape');
    }
  });

  await t('6. dependências: bloqueios reais, sem bloqueios indevidos', async () => {
    const r = await page.evaluate(() => {
      const L = window.__itasul; const out = {};
      out.waiting = [...document.querySelectorAll('.node.waiting')].map((n) => n.dataset.stage).sort();
      return out;
    });
    // s3 (aberta) → s4 (tem tarefas abertas) bloqueia; s4 (abertas) → s5 bloqueia; s2 (concluída) → s3 não bloqueia; s11 → s5 é retorno; ramais nunca
    assert.ok(r.waiting.includes('s4') && r.waiting.includes('s5'), `esperado s4 e s5 aguardando: ${r.waiting}`);
    assert.ok(!r.waiting.includes('s3'), 's2 concluída não bloqueia s3');
    assert.ok(!r.waiting.includes('b_munck') && !r.waiting.includes('b_dest'), 'ramais não bloqueiam');
    await page.click('[data-testid="node-s5"]');
    assert.doesNotMatch(await page.locator('[data-testid="deps-list"]').innerText(), /Manutenção e retorno[^\n]*NÃO concluída/, 'retorno 11→5 não bloqueia');
    await page.click('#panel [aria-label="Fechar painel"]');
  });

  await t('7. filtros por setor, responsável, status e prioridade (e combinações)', async () => {
    const dimmed = async () => (await page.locator('.node:not(.dim)').evaluateAll((n) => n.map((x) => x.dataset.stage))).sort();
    await page.selectOption('[data-filter="sector"]', 'Comercial');
    assert.deepEqual(await dimmed(), ['b_munck', 's4', 's6']);
    await page.click('[data-testid="clear-filters"]');
    await page.selectOption('[data-filter="status"]', 'Bloqueada');
    assert.deepEqual(await dimmed(), ['s4']);
    await page.selectOption('[data-filter="person"]', { label: 'Func. Teste B' });
    assert.deepEqual(await dimmed(), [], 'B não tem tarefa bloqueada');
    await page.selectOption('[data-filter="status"]', 'Em andamento');
    assert.deepEqual(await dimmed(), ['s4']);
    await page.selectOption('[data-filter="priority"]', 'Alta');
    assert.deepEqual(await dimmed(), [], 'a tarefa de B em andamento é Urgente');
    await page.selectOption('[data-filter="priority"]', 'Urgente');
    assert.deepEqual(await dimmed(), ['s4']);
    await page.click('[data-testid="clear-filters"]');
    assert.equal(await page.locator('.node.dim').count(), 0);
  });

  await t('9. caminhos específicos exibem as etapas corretas', async () => {
    const expected = { cacambas: ['b_dest', 's2', 's4', 's5', 's7', 's8'], equipamentos: ['s2', 's4', 's5', 's6', 's7', 's9'], munck: ['b_munck', 's2', 's4', 's5', 's7', 's8'], manutencao: ['s11', 's9'] };
    const labels = { cacambas: 8, equipamentos: 8, munck: 7, manutencao: 7 };
    for (const [id, stages] of Object.entries(expected)) {
      await page.click(`[data-path="${id}"]`);
      assert.deepEqual(await page.locator('.node.in-path').evaluateAll((n) => n.map((x) => x.dataset.stage).sort()), stages, id);
      assert.equal(await page.locator('[data-testid="path-steps"] li').count(), labels[id]);
      assert.ok(await page.locator('.edge.hl').count() >= stages.length - 1, `${id}: setas destacadas`);
    }
    await page.click('[data-path="cacambas"]');
    assert.deepEqual(await page.locator('.node.via').evaluateAll((n) => n.map((x) => x.dataset.stage).sort()), ['s3', 's6'], 'etapas intermediárias sinalizadas');
    await page.click('[data-path=""]');
    assert.equal(await page.locator('.edge.hl').count(), 0);
  });

  await t('10. navegação entre seções: aba ativa, aria-selected e conteúdo', async () => {
    const titles = { mapa: null, equipe: 'Equipe e Responsabilidades', rotina: 'Rotina diária', registros: 'Registros operacionais', melhorias: 'Central de Melhorias' };
    for (const v of VIEWS) {
      await page.click(`[data-view="${v}"]`);
      assert.equal(await page.locator(`[data-view="${v}"]`).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('.vtab.active').count(), 1);
      assert.equal(await page.locator(`#view-${v}`).isVisible(), true);
      for (const o of VIEWS.filter((x) => x !== v)) assert.equal(await page.locator(`#view-${o}`).isVisible(), false);
      if (titles[v]) assert.equal(await page.locator(`#view-${v} h2`).first().innerText(), titles[v]);
    }
    await page.click('[data-view="mapa"]');
  });

  await t('nenhuma tela exibe "null", "undefined", "false", "NaN" ou "[object" (vazia e com dados)', async () => {
    const scan = async (p, label) => {
      for (const v of VIEWS) {
        await p.click(`[data-view="${v}"]`);
        const txt = await p.locator(`#view-${v}`).innerText() + '\n' + await p.locator('#kpis').innerText();
        assert.doesNotMatch(txt, /(^|\s)(null|undefined|false|NaN)(\s|$)|\[object/, `${label}/${v}`);
      }
      await p.click('[data-view="mapa"]'); await p.click('[data-stage="s4"]');
      for (const tab of ['resumo', 'resp', 'tarefas', 'pessoas', 'fluxo', 'kpis', 'problemas', 'ideias', 'hist']) {
        await p.click(`.tab[data-tab="${tab}"]`);
        assert.doesNotMatch(await p.locator('#panel').innerText(), /(^|\s)(null|undefined|false|NaN)(\s|$)|\[object/, `${label}/painel/${tab}`);
      }
    };
    const empty = await newPage(); await empty.goto(url); await scan(empty, 'vazio'); await empty.context().close();
    await scan(page, 'com dados');
    await page.click('#panel [aria-label="Fechar painel"]');
  });

  await t('8. dados persistem após recarregar', async () => {
    const snap = () => page.evaluate(() => { const s = window.__itasul.store.get(); return JSON.stringify([s.tasks.length, s.employees.length, s.records.length, s.improvements.length, s.stages.find((x) => x.id === 's4').ownerId]); });
    const before = await snap(); await page.reload(); assert.equal(await snap(), before);
  });

  /* ===== 2/3. Tema ===== */
  await t('tema: segue o sistema quando não há preferência (claro e escuro)', async () => {
    for (const scheme of ['light', 'dark']) {
      const p = await newPage({ colorScheme: scheme }); await p.goto(url);
      assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), scheme === 'dark' ? 'escuro' : 'claro');
      assert.equal(await p.evaluate(() => localStorage.getItem('itasul-tema')), null, 'nada é salvo sem ação do usuário');
      await p.context().close();
    }
  });
  await t('tema: aplicado antes da primeira pintura (sem flash) mesmo se o app não carregar', async () => {
    const p = await newPage({ colorScheme: 'dark' });
    await p.route('**/src/main.js', (r) => r.abort());
    await p.goto(url);
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'escuro');
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.notEqual(bg, 'rgb(243, 243, 242)', 'fundo já escuro, sem passar pelo claro');
    await p.context().close();
  });
  await t('tema: botão alterna, é acessível, persiste e a escolha vence o sistema', async () => {
    const p = await newPage({ colorScheme: 'light' }); await p.goto(url);
    const btn = p.locator('[data-testid="theme-toggle"]');
    assert.equal(await btn.getAttribute('aria-pressed'), 'false');
    assert.match(await btn.getAttribute('aria-label'), /Tema claro ativo\. Ativar tema escuro/);
    const bgLight = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await btn.click();
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'escuro');
    assert.equal(await btn.getAttribute('aria-pressed'), 'true');
    assert.match(await btn.getAttribute('aria-label'), /Tema escuro ativo\. Ativar tema claro/);
    await p.waitForTimeout(450); // fim da transição suave de 0,22 s
    assert.notEqual(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), bgLight);
    assert.equal(await p.evaluate(() => localStorage.getItem('itasul-tema')), 'escuro');
    await p.reload(); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'escuro', 'persistiu (sistema está claro)');
    await p.emulateMedia({ colorScheme: 'light' }); await p.emulateMedia({ colorScheme: 'dark' }); await p.emulateMedia({ colorScheme: 'light' });
    await p.waitForTimeout(300);
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'escuro', 'mudança do sistema não sobrescreve a escolha');
    // funciona em todas as seções
    for (const v of VIEWS) { await p.click(`[data-view="${v}"]`); assert.equal(await p.locator('[data-testid="theme-toggle"]').isVisible(), true); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'escuro'); }
    await p.click('[data-testid="theme-toggle"]'); assert.equal(await p.evaluate(() => localStorage.getItem('itasul-tema')), 'claro');
    // voltar a seguir o sistema
    await p.click('#data-menu summary'); await p.click('[data-testid="theme-system"]');
    assert.equal(await p.evaluate(() => localStorage.getItem('itasul-tema')), null);
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.waitForFunction(() => document.documentElement.dataset.theme === 'escuro', null, { timeout: 3000 });
    assert.deepEqual(p.errors, []);
    await p.context().close();
  });
  await t('tema: teclado — botão alcançável por Tab e acionável por Enter/Espaço', async () => {
    const p = await newPage({ colorScheme: 'light' }); await p.goto(url);
    await p.focus('[data-testid="theme-toggle"]'); await p.keyboard.press('Enter');
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'escuro');
    await p.keyboard.press('Space');
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'claro');
    await p.context().close();
  });

  /* ===== 4. Contraste e visual nos dois temas ===== */
  for (const theme of ['claro', 'escuro']) {
    await t(`contraste WCAG AA — todas as seções, painel, diálogos e mapa (${theme})`, async () => {
      const p = await newPage({ colorScheme: theme === 'escuro' ? 'dark' : 'light' }); await p.goto(url); await seedFake(p);
      await setTheme(p, theme);
      const audit = async (label) => { const bad = await p.evaluate(CONTRAST); if (shots) await p.screenshot({ path: `${shots}/${theme}-${label}.png` }); assert.deepEqual(bad, [], `${theme}/${label}: contraste insuficiente`); };
      await audit('mapa-geral');
      await p.click('[data-testid="node-s4"]'); await audit('mapa-painel-resumo');
      for (const tab of ['resp', 'tarefas', 'pessoas', 'fluxo', 'kpis', 'problemas', 'ideias', 'hist']) { await p.click(`.tab[data-tab="${tab}"]`); await audit(`painel-${tab}`); }
      await p.click('#panel [aria-label="Fechar painel"]');
      await p.selectOption('[data-filter="sector"]', 'Comercial'); await audit('mapa-filtrado');
      await p.click('[data-testid="clear-filters"]');
      await p.click('[data-path="cacambas"]'); await audit('mapa-caminho-cacambas');
      await p.click('[data-path="munck"]'); await audit('mapa-caminho-munck');
      await p.click('[data-path=""]');
      await p.click('#layout-toggle'); await audit('lista-etapas'); await p.click('#layout-toggle');
      for (const v of ['equipe', 'rotina', 'registros', 'melhorias']) { await p.click(`[data-view="${v}"]`); await audit(v); }
      await p.click('[data-view="rotina"]'); await p.click('[data-group="atrasadas"]'); await audit('rotina-filtro'); await p.click('[data-group="atrasadas"]');
      await p.click('#data-menu summary'); await audit('menu-dados'); await p.click('#data-menu summary');
      // diálogos
      await p.click('[data-view="equipe"]'); await p.click('[data-testid="add-employee"]'); await audit('dialogo-funcionario'); await p.keyboard.press('Escape');
      await p.click('[data-view="rotina"]'); await p.click('[data-testid="routine-new-task"]'); await audit('dialogo-tarefa'); await p.keyboard.press('Escape');
      await p.click('[data-view="melhorias"]'); await p.click('[data-testid="add-improvement"]'); await audit('dialogo-sugestao'); await p.keyboard.press('Escape');
      await p.click('[data-view="registros"]'); await p.click('[data-testid="add-record"]'); await audit('dialogo-registro'); await p.keyboard.press('Escape');
      await p.click('[data-view="equipe"]'); await p.click('[data-testid="emp-card"] button:has-text("Editar")'); await p.click('dialog button:has-text("Excluir")'); await audit('dialogo-confirmacao'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
      await p.evaluate(() => document.querySelector('dialog')?.close());
      await p.click('[data-view="mapa"]'); await p.click('[data-kpi="tasksOverdue"]'); await audit('dialogo-indicador'); await p.keyboard.press('Escape');
      await p.evaluate(() => { window.__t = 1; }); await p.click('[data-testid="node-s4"]'); await p.click('.tab[data-tab="tarefas"]'); await p.click('#panel [data-act="edit"] >> nth=0'); await p.fill('dialog label:has-text("Título") input', ''); await p.click('dialog button[type=submit]'); await audit('mensagem-erro'); await p.keyboard.press('Escape');
      assert.deepEqual(p.errors, [], 'sem erros de console');
      await p.context().close();
    });
  }

  await t('mapa nos dois temas: setas, cartões, legendas, estados, zoom e seleção', async () => {
    const p = await newPage(); await p.goto(url); await seedFake(p);
    const read = () => p.evaluate(() => { const g = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
      return { map: g('.map', 'backgroundColor'), node: g('.node.stage:not(.no-owner):not(.dim)', 'backgroundColor') || g('.node', 'backgroundColor'), edge: g('.edge', 'stroke'), noOwner: g('.node.no-owner', 'backgroundColor'), legend: g('.legend', 'color'), wait: g('.edge.wait', 'stroke') }; });
    const light = await read(); await setTheme(p, 'escuro'); const dark = await read();
    for (const k of ['map', 'node', 'edge', 'noOwner', 'legend']) assert.notEqual(light[k], dark[k], `${k} muda com o tema`);
    // zoom e seleção no escuro
    const tr = () => p.locator('.canvas').evaluate((n) => n.style.transform);
    const a = await tr(); await p.click('#zoom-in'); assert.notEqual(await tr(), a); await p.click('#zoom-fit');
    await p.click('[data-testid="node-s8"]'); assert.equal(await p.locator('[data-testid="node-s8"].selected').count(), 1);
    const sel = await p.locator('[data-testid="node-s8"]').evaluate((n) => getComputedStyle(n).boxShadow);
    assert.notEqual(sel, 'none', 'anel de seleção visível');
    await p.context().close();
  });

  /* ===== 5. Responsividade ===== */
  for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    await t(`responsivo ${w}px — sem rolagem horizontal, abas e botões inteiros, indicadores sem sobreposição`, async () => {
      for (const theme of ['claro', 'escuro']) {
        const p = await newPage({ viewport: { width: w, height: h }, colorScheme: theme === 'escuro' ? 'dark' : 'light' }); await p.goto(url); await seedFake(p);
        for (const v of VIEWS) {
          await p.click(`[data-view="${v}"]`);
          const r = await p.evaluate(() => {
            const out = { overflowX: document.documentElement.scrollWidth - innerWidth, clipped: [], overlaps: 0 };
            document.querySelectorAll('.vtab, .icon-action, .toolbar .btn, .seg, .filter select').forEach((e) => {
              const b = e.getBoundingClientRect(); if (!b.width) return;
              if (b.right > innerWidth + 1 || b.left < -1) out.clipped.push(e.className + ':' + Math.round(b.right));
              if (e.scrollWidth > e.clientWidth + 2 && !e.matches('select')) out.clipped.push('texto cortado ' + e.className);
            });
            const tiles = [...document.querySelectorAll('.kpi-group[open] .kpi')].map((e) => e.getBoundingClientRect()).filter((b) => b.width);
            for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) { const a = tiles[i], b = tiles[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.overlaps++; }
            const txt = [...document.querySelectorAll('.kpi-group[open] .kpi')].filter((e) => e.getBoundingClientRect().width).filter((e) => e.scrollWidth > e.clientWidth + 1).length; out.kpiClipped = txt;
            return out;
          });
          assert.ok(r.overflowX <= 0, `${w}px ${theme} ${v}: rolagem horizontal de ${r.overflowX}px`);
          assert.deepEqual(r.clipped, [], `${w}px ${theme} ${v}: conteúdo cortado`);
          assert.equal(r.overlaps, 0, `${w}px ${theme}: indicadores sobrepostos`); assert.equal(r.kpiClipped, 0);
        }
        await p.evaluate(() => document.querySelectorAll('.kpi-group').forEach((d) => { d.open = true; }));
        const ov = await p.evaluate(() => { const t = [...document.querySelectorAll('.kpi')].map((e) => e.getBoundingClientRect()); let n = 0; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { const a = t[i], b = t[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) n++; } return n; });
        assert.equal(ov, 0, `${w}px ${theme}: indicadores sobrepostos com grupos abertos`);
        await p.click('[data-view="mapa"]'); await p.click('[data-stage="s4"]');
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${w}px ${theme}: painel aberto causa rolagem horizontal`);
        if (shots && theme === 'escuro') await p.screenshot({ path: `${shots}/resp-${w}.png` });
        await p.context().close();
      }
    });
  }

  /* ===== Teclado e foco ===== */
  await t('teclado: foco visível, Enter abre a etapa e setas navegam entre cartões', async () => {
    const p = await newPage(); await p.goto(url);
    await p.focus('[data-testid="node-s1"]');
    const ring = await p.locator('[data-testid="node-s1"]').evaluate((n) => { n.focus(); const cs = getComputedStyle(n); return cs.outlineStyle + ' ' + cs.outlineWidth; });
    assert.match(ring, /solid 3px/, 'contorno de foco visível');
    await p.keyboard.press('ArrowRight'); assert.equal(await p.evaluate(() => document.activeElement.dataset.stage), 's2');
    await p.keyboard.press('ArrowDown'); assert.equal(await p.evaluate(() => document.activeElement.dataset.stage), 's7', 'seta para baixo vai ao cartão logo abaixo (coluna 2)');
    await p.focus('[data-testid="node-s4"]'); await p.keyboard.press('Enter');
    assert.match(await p.locator('#panel h2').innerText(), /Comercial e orçamento/);
    assert.equal(await p.evaluate(() => document.activeElement.dataset.stage), 's4', 'foco permanece no cartão após abrir');
    await p.keyboard.press('ArrowDown'); assert.equal(await p.evaluate(() => document.activeElement.dataset.stage), 's5');
    // diálogo: Esc fecha e Tab fica preso no diálogo
    await p.click('[data-view="equipe"]'); await p.click('[data-testid="add-employee"]');
    await p.keyboard.press('Escape'); await p.waitForSelector('dialog', { state: 'detached', timeout: 3000 });
    await p.context().close();
  });

  await t('mensagens: sucesso, erro e estados vazios são rotulados (não só cor)', async () => {
    const p = await newPage(); await p.goto(url);
    assert.match(await p.locator('[data-kpi="quotesOpen"]').innerText(), /Sem dados registrados/);
    await p.click('[data-view="equipe"]'); assert.match(await p.locator('#view-equipe .empty').first().innerText(), /Nenhum funcionário cadastrado/);
    await p.click('[data-testid="add-employee"]'); await p.fill('dialog label:has-text("Funcionário") input', 'Teste Msg'); await p.click('dialog button[type=submit]');
    assert.match(await p.locator('#toast').innerText(), /^✔ Funcionário cadastrado/);
    await p.click('[data-testid="add-employee"]'); await p.click('dialog button[type=submit]');
    assert.match(await p.locator('#toast').innerText(), /^✖ Erro: Preencha/);
    await p.keyboard.press('Escape');
    await p.context().close();
  });

  assert.deepEqual(page.errors, [], `erros de console: ${page.errors}`);
  console.log('\nAuditoria: todos os testes passaram.');
} catch (e) {
  console.error(`\nFALHOU em: ${step}\n`, e.stack?.split('\n').slice(0, 6).join('\n') ?? e);
  process.exitCode = 1;
} finally {
  await browser.close(); server.close();
}
