// Fluxo de gestão de funcionários e tarefas (Playwright, navegador real). Uso: npm run test:e2e
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { start } from '../../tools/serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const server = await start(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
let step = 'início';
const t = async (name, fn) => { step = name; await fn(); console.log(`ok  ${name}`); };
const iso = (d) => d.toLocaleDateString('sv');
const today = iso(new Date()), yesterday = iso(new Date(Date.now() - 864e5));
const field = (page, label, sel = 'input') => page.locator(`dialog label:has-text("${label}") ${sel}`).first();

try {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); }); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);

  await t('cadastrar funcionários (um completo, um com dados faltantes → "A definir")', async () => {
    await page.click('[data-view="equipe"]');
    await page.click('[data-testid="add-employee"]');
    await field(page, 'Funcionário').fill('Ana Teste');
    await field(page, 'Cargo ou função').fill('Atendente de teste');
    await field(page, 'Setor', 'select').selectOption('Atendimento');
    await page.click('dialog button[type=submit]');
    await page.click('[data-testid="add-employee"]');
    await field(page, 'Funcionário').fill('Beto Teste');
    await page.click('dialog button[type=submit]');
    const cards = page.locator('[data-testid="emp-card"]');
    assert.equal(await cards.count(), 2);
    assert.match(await cards.nth(0).innerText(), /Cargo: Atendente de teste · Setor: Atendimento/);
    assert.match(await cards.nth(1).innerText(), /Cargo: A definir · Setor: A definir/);
    assert.match(await cards.nth(1).innerText(), /Papel nos processos: A definir/);
    assert.match(await cards.nth(0).innerText(), /Tarefas: nenhuma atribuída/);
  });

  await t('criar tarefas pela Rotina diária (com etapa, responsável, frequência, prazo)', async () => {
    await page.click('[data-view="rotina"]');
    assert.equal(await page.locator('[data-testid="routine-day"]').inputValue(), today);
    await page.click('[data-testid="routine-new-task"]');
    await field(page, 'Título').fill('Registrar solicitações do dia');
    await field(page, 'Descrição', 'textarea').fill('Anotar origem do contato');
    await field(page, 'Etapa relacionada', 'select').selectOption({ label: 'Recepção e atendimento' });
    await field(page, 'Responsável', 'select').selectOption({ label: 'Ana Teste' });
    await field(page, 'Frequência', 'select').selectOption('Diária');
    await field(page, 'Prioridade', 'select').selectOption('Alta');
    await field(page, 'Observações', 'textarea').fill('obs teste');
    await page.click('dialog button[type=submit]');
    await page.selectOption('[data-testid="routine-person"]', { label: 'Ana Teste' });
    const row = page.locator('[data-testid="routine-day-list"] [data-testid="task-row"]');
    assert.equal(await row.count(), 1, 'prazo pré-preenchido com o dia selecionado');
    const txt = await row.innerText();
    assert.match(txt, /Registrar solicitações do dia/); assert.match(txt, /Diária/); assert.match(txt, /Etapa: Recepção e atendimento/); assert.match(txt, /obs teste/);
  });

  await t('criar tarefa atrasada pelo cartão da pessoa e filtrar por situação', async () => {
    await page.click('[data-view="equipe"]');
    await page.click('[data-testid="emp-card"]:has-text("Ana Teste") [data-act="new-task"]');
    await field(page, 'Título').fill('Conferir pendência antiga');
    await field(page, 'Etapa relacionada', 'select').selectOption({ label: 'Entrada do cliente' });
    await field(page, 'Prazo').fill(yesterday);
    await page.click('dialog button[type=submit]');
    assert.match(await page.locator('[data-testid="emp-card"]:has-text("Ana Teste") [data-testid="emp-counts"]').innerText(), /2 atribuída\(s\) · 2 pendente\(s\) · 1 atrasada\(s\) · 0 bloqueada\(s\)/);
    await page.click('[data-testid="emp-card"]:has-text("Ana Teste") [data-act="routine"]');
    assert.equal(await page.locator('[data-testid="routine-person"] option:checked').innerText(), 'Ana Teste');
    assert.equal(await page.locator('[data-testid="routine-carried-list"] [data-testid="task-row"]').count(), 1);
    await page.click('[data-group="atrasadas"]');
    assert.equal(await page.locator('[data-testid="routine-day-list"] [data-testid="task-row"]').count(), 0);
    assert.equal(await page.locator('[data-testid="routine-carried-list"] [data-testid="task-row"]').count(), 1);
    await page.click('[data-group="atrasadas"]');
    await page.click('[data-group="bloqueadas"]');
    assert.equal(await page.locator('#view-rotina [data-testid="task-row"]').count(), 0);
    await page.click('[data-group="bloqueadas"]');
  });

  await t('navegar entre dias e consultar o dia anterior', async () => {
    await page.click('[data-testid="day-prev"]');
    assert.equal(await page.locator('[data-testid="routine-day"]').inputValue(), yesterday);
    assert.equal(await page.locator('[data-testid="routine-day-list"] [data-testid="task-row"]').count(), 1);
    assert.match(await page.locator('[data-testid="routine-day-list"]').innerText(), /Conferir pendência antiga/);
    await page.click('[data-testid="day-next"]');
  });

  await t('concluir e reabrir pela rotina; filtros pendentes/concluídas', async () => {
    const dayRow = '[data-testid="routine-day-list"] [data-testid="task-row"]';
    await page.click(`${dayRow} [data-act="complete"]`);
    await page.click('[data-group="concluidas"]');
    assert.equal(await page.locator(dayRow).count(), 1);
    await page.click('[data-group="concluidas"]'); await page.click('[data-group="pendentes"]');
    assert.equal(await page.locator(dayRow).count(), 0);
    await page.click('[data-group="pendentes"]'); await page.click('[data-group="concluidas"]');
    await page.click(`${dayRow} [data-act="reopen"]`);
    assert.equal(await page.locator(dayRow).count(), 0, 'reaberta sai de "concluídas"');
    await page.click('[data-group="concluidas"]');
    assert.match(await page.locator(dayRow).innerText(), /Pendente/);
  });

  await t('editar tarefa trocando a etapa e o responsável (A definir)', async () => {
    await page.click('[data-testid="routine-day-list"] [data-testid="task-row"] [data-act="edit"]');
    await field(page, 'Etapa relacionada', 'select').selectOption({ label: 'Comercial e orçamento' });
    await field(page, 'Responsável', 'select').selectOption({ label: 'A definir' });
    await page.click('dialog button[type=submit]');
    assert.equal(await page.locator('[data-testid="routine-day-list"] [data-testid="task-row"]').count(), 0, 'saiu da rotina da Ana');
    await page.selectOption('[data-testid="routine-person"]', '__none');
    assert.match(await page.locator('[data-testid="routine-day-list"]').innerText(), /Etapa: Comercial e orçamento[\s\S]*Responsável: A definir|Responsável: A definir[\s\S]*Etapa: Comercial e orçamento/);
    await page.click('[data-view="equipe"]');
    assert.match(await page.locator('[data-testid="orphan-tasks"]').innerText(), /Registrar solicitações do dia/);
  });

  await t('painel da etapa: responsabilidades, vinculados, prazos, dependência e entregas', async () => {
    await page.click('[data-view="mapa"]');
    await page.click('[data-testid="node-s4"]');
    const txt = await page.locator('.tab-body').innerText();
    for (const h of ['Objetivo', 'Responsabilidades', 'Funcionários vinculados', 'Dependências e transferências', 'Entregas para o próximo setor', 'Tarefas e prazos', 'Indicadores', 'Pendências']) assert.match(txt, new RegExp(h), h);
    assert.match(await page.locator('[data-testid="linked-list"], .psec:has-text("Funcionários vinculados") .undef').first().innerText(), /A definir|Ana|Beto/);
    assert.match(await page.locator('[data-testid="next-due"]').innerText(), /Próximo prazo: \d\d\/\d\d\/\d{4}/);
  });

  await t('dependência: etapa anterior em aberto sinaliza; concluir remove; reabrir volta', async () => {
    const kpi = async () => Number((await page.locator('[data-kpi="extra-waiting"]').innerText()).match(/^\d+/)[0]);
    const k0 = await kpi();
    await page.click('[data-testid="node-s3"]');
    await page.click('.tab[data-tab="tarefas"]');
    await page.click('[data-testid="add-task"]');
    assert.equal(await field(page, 'Etapa relacionada', 'select').inputValue(), 's3', 'etapa pré-selecionada');
    await field(page, 'Título').fill('Encaminhar demanda ao comercial');
    await page.click('dialog button[type=submit]');
    await page.click('[data-testid="node-s4"]');
    assert.match(await page.locator('[data-testid="deps-list"]').innerText(), /NÃO concluída \(1 tarefa/);
    assert.match(await page.locator('[data-testid="deps-list"]').innerText(), /transferência entre setores/);
    assert.equal(await page.locator('[data-testid="node-s4"].waiting').count(), 1);
    assert.match(await page.locator('[data-testid="node-s4"]').innerText(), /aguarda 1/);
    assert.equal(await kpi(), k0 + 1, 's4 passa a aguardar a etapa 3 (ramal é opcional)');
    assert.equal(await kpi(), await page.locator('.node.waiting').count(), 'indicador = cartões sinalizados');
    await page.click('[data-testid="node-s3"]'); await page.click('.tab[data-tab="tarefas"]');
    await page.click('#panel [data-testid="task-row"] [data-act="complete"]');
    await page.click('[data-testid="node-s4"]'); await page.click('.tab[data-tab="resumo"]');
    assert.match(await page.locator('[data-testid="deps-list"]').innerText(), /etapa anterior concluída/);
    assert.equal(await page.locator('[data-testid="node-s4"].waiting').count(), 0);
    assert.equal(await kpi(), k0 - 1, 's3 concluída deixa de aguardar a etapa 2; s4 deixa de aguardar s3');
    await page.click('[data-testid="node-s3"]'); await page.click('.tab[data-tab="tarefas"]');
    await page.click('#panel [data-testid="task-row"] [data-act="reopen"]');
    assert.equal(await kpi(), k0 + 1);
    assert.equal(await kpi(), await page.locator('.node.waiting').count(), 'indicador = cartões sinalizados');
  });

  await t('tabela de transferências entre setores mostra origem em aberto', async () => {
    await page.click('[data-view="equipe"]');
    const row = page.locator('[data-testid="handoff-row"]:has-text("Recepção e atendimento")', { hasText: 'Comercial e orçamento' }).first();
    const txt = await row.innerText();
    assert.match(txt, /Atendimento/); assert.match(txt, /Comercial/); assert.match(txt, /em aberto/);
    assert.ok(await page.locator('[data-testid="handoff-row"].waiting').count() >= 1);
  });

  await t('vincular funcionário a várias etapas; continua "A definir" como responsável', async () => {
    await page.click('[data-view="mapa"]');
    for (const id of ['s2', 's7']) {
      await page.click(`[data-testid="node-${id}"]`);
      await page.click('.tab[data-tab="pessoas"]');
      await page.selectOption('[data-testid="link-emp-select"]', { label: 'Beto Teste' });
      await page.click('[data-testid="link-emp-btn"]');
    }
    await page.click('[data-view="equipe"]');
    const card = page.locator('[data-testid="emp-card"]:has-text("Beto Teste")');
    assert.equal(await page.locator('[data-testid="emp-card"]').count(), 2, 'sem duplicar cadastro');
    assert.match(await card.innerText(), /Entrada do cliente — Participa/); assert.match(await card.innerText(), /Operação, entrega e retirada — Participa/);
    assert.equal(await page.evaluate(() => window.__itasul.store.get().stages.every((s) => s.ownerId === null)), true);
  });

  await t('indicadores abrem os registros reais que os compõem', async () => {
    await page.click('[data-view="mapa"]');
    const total = await page.evaluate(() => window.__itasul.store.get().stages.filter((s) => !s.ownerId).length);
    assert.match(await page.locator('[data-kpi="extra-noowner"]').innerText(), new RegExp(`^${total}\\b`));
    await page.click('[data-kpi="extra-noowner"]');
    assert.equal(await page.locator('[data-testid="ind-items"] li').count(), total);
    await page.keyboard.press('Escape');
    const open = await page.evaluate(() => window.__itasul.store.get().tasks.filter((x) => x.status !== 'Concluída').length);
    assert.match(await page.locator('[data-kpi="extra-open"]').innerText(), new RegExp(`^${open}\\b`));
    await page.click('[data-kpi="extra-open"]');
    assert.equal(await page.locator('[data-testid="ind-items"] li').count(), open);
    await page.keyboard.press('Escape');
    assert.match(await page.locator('[data-kpi="tasksOverdue"]').innerText(), /^1\b/);
    await page.click('[data-kpi="tasksOverdue"]');
    assert.match(await page.locator('[data-testid="ind-items"]').innerText(), /Conferir pendência antiga/);
    await page.keyboard.press('Escape');
  });

  await t('persistência: tudo permanece após recarregar', async () => {
    const before = await page.evaluate(() => JSON.stringify({ t: window.__itasul.store.get().tasks.length, e: window.__itasul.store.get().employees.length }));
    await page.reload();
    assert.equal(await page.evaluate(() => JSON.stringify({ t: window.__itasul.store.get().tasks.length, e: window.__itasul.store.get().employees.length })), before);
    assert.match(await page.locator('[data-kpi="tasksOverdue"]').innerText(), /^1\b/);
    await page.click('[data-view="rotina"]');
    await page.selectOption('[data-testid="routine-person"]', { label: 'Ana Teste' });
    assert.match(await page.locator('[data-testid="routine-carried-list"]').innerText(), /Conferir pendência antiga/);
  });

  assert.deepEqual(errors, [], `erros no console: ${errors}`);
  console.log('\nFluxo de gestão: todos os testes passaram.');
} catch (e) {
  console.error(`\nFALHOU em: ${step}\n`, e.stack);
  process.exitCode = 1;
} finally {
  await browser.close(); server.close();
}
