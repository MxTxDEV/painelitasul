// Teste de interface com Playwright (pré-instalado no ambiente; não é dependência do projeto).
// Uso: npm run test:e2e
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { start } from '../../tools/serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const server = await start(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
let step = 'início';
const t = async (name, fn) => { step = name; await fn(); console.log(`ok  ${name}`); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);

  await t('mapa mostra 11 etapas + 2 ramais e todas sem responsável', async () => {
    assert.equal(await page.locator('.node.stage').count(), 11);
    assert.equal(await page.locator('.node.branch').count(), 2);
    assert.equal(await page.locator('.node.no-owner').count(), 13);
  });
  await t('indicadores sem dados mostram "Sem dados registrados"', async () => {
    assert.equal(await page.locator('[data-kpi="tasksOverdue"]').innerText().then((x) => x.includes('Sem dados registrados')), true);
    assert.equal(await page.locator('.kpi.nodata').count() >= 9, true);
    assert.match(await page.locator('[data-kpi="extra-noowner"]').innerText(), /13/);
  });
  await t('clicar na etapa abre painel com 9 abas', async () => {
    await page.click('[data-testid="node-s4"]');
    assert.equal(await page.locator('.panel .tab').count(), 9);
    assert.match(await page.locator('.panel h2').innerText(), /Comercial e orçamento/);
    await page.click('.tab[data-tab="fluxo"]');
    assert.match(await page.locator('.tab-body').innerText(), /transferência de responsabilidade/);
  });
  await t('cadastrar funcionário e vincular a duas etapas', async () => {
    await page.click('[data-view="equipe"]');
    await page.click('[data-testid="add-employee"]');
    await page.fill('dialog input[type=text]', 'Pessoa Teste');
    await page.check('dialog .check:has-text("Entrada do cliente") input');
    await page.check('dialog .check:has-text("Recepção e atendimento") input');
    await page.click('dialog button[type=submit]');
    assert.equal(await page.locator('[data-testid="emp-card"]').count(), 1);
    assert.match(await page.locator('[data-testid="emp-card"]').innerText(), /Entrada do cliente[\s\S]*Recepção/);
  });
  await t('definir responsável principal da etapa 4', async () => {
    await page.click('[data-view="mapa"]');
    await page.click('[data-testid="node-s4"]');
    await page.click('.tab[data-tab="pessoas"]');
    await page.selectOption('[data-testid="sel-ownerId"]', { label: 'Pessoa Teste' });
    assert.equal(await page.locator('.node.no-owner').count(), 12);
    assert.match(await page.locator('[data-kpi="extra-noowner"]').innerText(), /12/);
  });
  await t('criar tarefa atrasada e vê-la no indicador', async () => {
    await page.click('.tab[data-tab="tarefas"]');
    await page.click('[data-testid="add-task"]');
    await page.fill('dialog input[type=text]', 'Enviar orçamentos pendentes');
    await page.fill('dialog input[type=date]', '2020-01-01');
    await page.click('dialog button[type=submit]');
    assert.match(await page.locator('[data-testid="task-row"]').innerText(), /ATRASADA/);
    assert.match(await page.locator('[data-kpi="tasksOverdue"]').innerText(), /^1\b/);
    assert.equal(await page.locator('[data-testid="node-s4"] .alert.late').count(), 1);
    await page.click('[data-kpi="tasksOverdue"]');
    assert.match(await page.locator('dialog').innerText(), /Enviar orçamentos pendentes/);
    await page.keyboard.press('Escape');
  });
  await t('editar status da tarefa para Bloqueada e concluir', async () => {
    await page.click('[data-testid="task-row"] button:has-text("Editar")');
    await page.selectOption('dialog label:has-text("Status") select', 'Bloqueada');
    await page.click('dialog button[type=submit]');
    assert.match(await page.locator('[data-kpi="extra-blocked"]').innerText(), /^1\b/);
    await page.click('[data-testid="task-row"] button:has-text("Concluir")');
    assert.match(await page.locator('[data-kpi="tasksOverdue"]').innerText(), /^0\b/);
  });
  await t('caminhos específicos destacam etapas', async () => {
    await page.click('[data-path="cacambas"]');
    assert.equal(await page.locator('.node.in-path').count(), 6); // s2,s4,s5,s7,s8,b_dest
    assert.equal(await page.locator('[data-testid="path-steps"] li').count(), 8);
    await page.click('[data-path="munck"]');
    assert.equal(await page.locator('[data-testid="node-b_munck"].in-path').count(), 1);
    await page.click('[data-path="equipamentos"]');
    await page.click('[data-path="manutencao"]');
    assert.equal(await page.locator('.node.in-path').count(), 2);
    await page.click('[data-path=""]');
    assert.equal(await page.locator('.node.in-path').count(), 0);
  });
  await t('filtros de setor e limpar', async () => {
    await page.selectOption('[data-filter="sector"]', 'Financeiro');
    assert.equal(await page.locator('.node:not(.dim)').count(), 1);
    await page.click('[data-testid="clear-filters"]');
    assert.equal(await page.locator('.node.dim').count(), 0);
  });
  await t('zoom e ajuste alteram a transformação do mapa', async () => {
    const tr = () => page.locator('.canvas').evaluate((n) => n.style.transform);
    const a = await tr(); await page.click('#zoom-in'); const b = await tr();
    assert.notEqual(a, b); await page.click('#zoom-fit'); assert.notEqual(await tr(), b);
  });
  await t('adicionar nova etapa', async () => {
    await page.click('[data-testid="add-stage"]');
    await page.fill('dialog input[type=text]', 'Etapa nova');
    await page.click('dialog button[type=submit]');
    assert.equal(await page.locator('.node').count(), 14);
  });
  await t('central de melhorias: cadastrar, vincular, avaliar, IA separada', async () => {
    await page.click('[data-view="melhorias"]');
    assert.match(await page.locator('.ai-box').innerText(), /NÃO são decisões aprovadas/);
    await page.click('[data-testid="add-improvement"]');
    await page.fill('dialog input[type=text] >> nth=0', 'Melhorar retorno');
    await page.selectOption('dialog select >> nth=-1', { label: 'Etapa: Comercial e orçamento' });
    await page.selectOption('dialog select >> nth=-2', 'Em avaliação');
    await page.click('dialog button[type=submit]');
    assert.match(await page.locator('[data-testid="imp-card"]').innerText(), /Vinculada a Etapa: Comercial e orçamento/);
    assert.match(await page.locator('[data-kpi="improvementsReview"]').innerText(), /^1\b/);
    await page.click('[data-testid="ai-card"] button >> nth=0');
    assert.match(await page.locator('dialog input[type=text] >> nth=0').inputValue(), /origem de todo contato/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-testid="imp-card"]').count(), 1, 'sugestão da IA não vira cadastro sozinha');
  });
  await t('indicador sem registros: abre lista vazia, permite valor manual', async () => {
    await page.click('[data-view="mapa"]');
    await page.click('[data-kpi="rentalsActive"]');
    assert.match(await page.locator('dialog').innerText(), /Sem dados registrados/);
    await page.click('[data-testid="ind-manual"]');
    await page.fill('dialog input', '3');
    await page.click('dialog button[type=submit]');
    assert.match(await page.locator('[data-kpi="rentalsActive"]').innerText(), /^3\b/);
  });
  await t('registros alimentam indicadores e cada indicador lista seus itens', async () => {
    await page.click('[data-view="registros"]');
    for (const [kind, title, status] of [['Locação', 'Locação obra A', 'Em andamento'], ['Orçamento', 'Orç. 1', 'Aberto'], ['Orçamento', 'Orç. 2', 'Aguardando retorno'], ['Entrega', 'Entrega X', 'Programado'], ['Pendência financeira', 'Pend. 1', 'Aberto'], ['Equipamento indisponível', 'Equip. Y', 'Em andamento']]) {
      await page.click('[data-testid="add-record"]');
      await page.selectOption('dialog select >> nth=0', kind);
      await page.fill('dialog input[type=text]', title);
      await page.selectOption('dialog select >> nth=1', status);
      await page.click('dialog button[type=submit]');
    }
    assert.equal(await page.locator('[data-testid="record-row"]').count(), 6);
    for (const [k, n] of [['rentalsActive', 1], ['quotesOpen', 1], ['quotesAwaiting', 1], ['deliveriesPlanned', 1], ['financePending', 1], ['equipmentDown', 1]]) {
      assert.match(await page.locator(`[data-kpi="${k}"]`).innerText(), new RegExp(`^${n}\\b`), k);
    }
    await page.click('[data-kpi="quotesAwaiting"]');
    assert.match(await page.locator('[data-testid="ind-items"]').innerText(), /Orç\. 2/);
    assert.doesNotMatch(await page.locator('[data-testid="ind-items"]').innerText(), /Orç\. 1/);
    await page.keyboard.press('Escape');
    // concluir o registro tira do indicador
    await page.click('[data-testid="record-row"]:has-text("Orç. 2") button:has-text("Editar")');
    await page.selectOption('dialog select >> nth=1', 'Concluído');
    await page.click('dialog button[type=submit]');
    assert.match(await page.locator('[data-kpi="quotesAwaiting"]').innerText(), /^0\b/);
  });
  await t('painel amplo: visão completa traz todas as seções', async () => {
    await page.click('[data-view="mapa"]');
    await page.click('[data-testid="node-s4"]');
    const txt = await page.locator('.tab-body').innerText();
    for (const h of ['Objetivo', 'Responsável', 'Pendências', 'Tarefas', 'Entradas e entregas', 'Indicadores', 'Sugestões de melhoria']) assert.match(txt, new RegExp(h), h);
    assert.ok((await page.locator('#panel').boundingBox()).width >= 520, 'painel largo');
  });
  await t('reabrir tarefa concluída atualiza indicadores', async () => {
    assert.match(await page.locator('[data-testid="task-row"]').innerText(), /Concluída/);
    await page.click('[data-testid="task-row"] [data-act="reopen"]');
    assert.match(await page.locator('[data-testid="task-row"]').innerText(), /Pendente/);
    assert.match(await page.locator('[data-kpi="extra-open"]').innerText(), /^1\b/);
    assert.match(await page.locator('[data-kpi="tasksOverdue"]').innerText(), /^1\b/, 'prazo antigo volta a contar como atrasada');
    assert.match(await page.locator('[data-testid="pending-list"]').innerText(), /Atrasada: Enviar orçamentos pendentes/);
    await page.click('[data-testid="task-row"] [data-act="complete"]');
    assert.match(await page.locator('[data-kpi="tasksOverdue"]').innerText(), /^0\b/);
    await page.click('[data-testid="task-row"] [data-act="reopen"]');
  });
  await t('vincular funcionário pelo painel sem torná-lo responsável', async () => {
    await page.evaluate(() => window.__itasul.store.addEmployee({ name: 'Segunda Pessoa' }));
    await page.click('[data-testid="node-s5"]');
    await page.click('.tab[data-tab="pessoas"]');
    await page.selectOption('[data-testid="link-emp-select"]', { label: 'Segunda Pessoa' });
    await page.click('[data-testid="link-emp-btn"]');
    assert.match(await page.locator('.tab-body').innerText(), /Segunda Pessoa/);
    await page.click('.tab[data-tab="resumo"]');
    assert.match(await page.locator('[data-testid="owner-line"]').innerText(), /Principal: A definir/);
    assert.equal(await page.locator('[data-testid="node-s5"].no-owner').count(), 1);
    assert.equal(await page.evaluate(() => window.__itasul.store.get().employees.filter((e) => e.name === 'Segunda Pessoa').length), 1);
  });
  await t('navegação entre etapas pelos links de entrada/saída', async () => {
    await page.click('[data-testid="node-s4"]');
    await page.click('.tab-body [data-nav="s5"]');
    assert.match(await page.locator('.panel h2').innerText(), /Disponibilidade e preparação/);
    await page.click('.tab-body [data-nav="s4"]');
    assert.match(await page.locator('.panel h2').innerText(), /Comercial e orçamento/);
  });
  await t('sugestão criada a partir da etapa aparece no painel', async () => {
    await page.click('[data-testid="add-stage-idea"]');
    await page.fill('dialog input[type=text] >> nth=0', 'Ideia da etapa 4');
    await page.click('dialog button[type=submit]');
    assert.match(await page.locator('[data-testid="stage-ideas"]').innerText(), /Ideia da etapa 4/);
  });
  await t('dados persistem após recarregar', async () => {
    await page.reload();
    assert.match(await page.locator('[data-kpi="rentalsActive"]').innerText(), /^1\b/);
    assert.match(await page.locator('[data-kpi="extra-open"]').innerText(), /^1\b/);
    await page.click('[data-testid="node-s4"]');
    assert.match(await page.locator('.tab-body').innerText(), /Enviar orçamentos pendentes[\s\S]*Ideia da etapa 4/);
    await page.click('[data-view="registros"]');
    assert.equal(await page.locator('[data-testid="record-row"]').count(), 6);
    await page.click('[data-view="equipe"]');
    assert.equal(await page.locator('[data-testid="emp-card"]').count(), 2);
    assert.equal(await page.locator('[data-testid="coverage-row"] td.undef').count() > 0, true);
  });
  await t('exportar gera JSON válido', async () => {
    const json = await page.evaluate(() => window.__itasul.store.exportJSON());
    const d = JSON.parse(json);
    assert.equal(d.employees.length, 2); assert.equal(d.tasks.length, 1);
  });
  await t('nome com HTML é exibido como texto (sem XSS)', async () => {
    await page.evaluate(() => window.__itasul.store.addEmployee({ name: '<img src=x onerror=window.__xss=1>' }));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.match(await page.locator('.org').innerText(), /<img src=x/);
  });
  assert.deepEqual(errors, [], `erros no console: ${errors}`);

  const mob = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await mob.goto(url);
  await t('celular: abre em lista, sem rolagem horizontal, painel como folha', async () => {
    assert.equal(await mob.locator('#stage-list').isVisible(), true);
    assert.equal(await mob.locator('#map').isVisible(), false);
    assert.equal(await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await mob.click('.list-card >> nth=0');
    assert.equal(await mob.locator('#panel').isVisible(), true);
    await mob.click('#layout-toggle');
  });
  console.log('\nTodos os testes de interface passaram.');
} catch (e) {
  console.error(`\nFALHOU em: ${step}\n`, e.message);
  process.exitCode = 1;
} finally {
  await browser.close(); server.close();
}
