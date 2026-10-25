# Painel Visual de Gestão — ITASUL OS

Mapa operacional interativo do fluxo de locação do Grupo ITASUL: etapas conectadas, cartões clicáveis, painel de detalhes, equipe, indicadores e central de melhorias.

App web estático: HTML + CSS + JavaScript (módulos ES). **Sem build, sem dependências, sem backend, sem integrações externas** (nada de WhatsApp, TotalLoc, bancos de dados ou envio de mensagens).

## Como usar
```
npm start            # abre em http://localhost:8080 (ou: npm start 3000)
npm test             # testes unitários (node --test)
npm run test:e2e     # testes de interface (usa o Playwright já instalado no ambiente)
```
Também funciona hospedado em qualquer servidor estático (GitHub Pages, Vercel etc.). Não abra `index.html` direto pelo `file://` (módulos ES exigem http).

## Telas
- **Mapa do processo** — 11 etapas + 2 ramais (Análise Munck, Destinação de caçambas). Arraste para mover, roda do mouse/botões para zoom, "Ajustar" para enquadrar. Seletor de **caminho** (Caçambas, Equipamentos, Caminhão Munck, Manutenção) destaca só as etapas do caminho, numeradas, sem perder a visão geral. Em telas pequenas abre em **lista**.
- **Painel lateral** (clique numa etapa) — abas: Resumo, Responsabilidades, Tarefas, Responsáveis (principal e substituto), Entradas e entregas (com aviso de transferência entre setores), Indicadores, Problemas, Melhorias vinculadas, Histórico.
- **Equipe e Responsabilidades** — cadastro único de funcionários vinculados a várias etapas, hierarquia por "quem coordena" e tabela de cobertura (quem responde por cada etapa; "A definir" em destaque).
- **Central de Melhorias** — sugestões com todos os campos pedidos, vínculo a etapa/tarefa/funcionário, filtro por status. Ideias da IA ficam numa seção separada, marcadas como não aprovadas; só viram sugestão (status "Nova") se você clicar em adotar.
- **Indicadores no topo** — "Sem dados registrados" até haver dados. Tarefas atrasadas, manutenções pendentes e sugestões em avaliação são **calculadas** das tarefas/sugestões cadastradas; os demais (orçamentos, locações, entregas, pendências financeiras, equipamentos indisponíveis) são **informados manualmente** ao clicar. Clicar nos calculados abre os itens.
- **Filtros** por setor, responsável, status e prioridade (etapas que não casam ficam esmaecidas).

## Dados e segurança
- Persistência em `localStorage` (chave `itasul-painel-v1`), só neste navegador. **Exportar backup** gera um JSON.
- **Importar** valida o arquivo, pede confirmação e guarda antes uma cópia de segurança (**Restaurar cópia de segurança** desfaz). **Reiniciar** também guarda cópia. Arquivo inválido nunca altera os dados.
- Todo texto cadastrado é exibido como texto (sem `innerHTML`), evitando injeção de HTML.
- Nada é atribuído automaticamente: responsáveis nascem "A definir"; nenhum valor financeiro, nome ou resultado é pré-cadastrado.

## Arquitetura
```
index.html
src/
  main.js            orquestra telas, filtros, indicadores, menu de dados
  styles.css         identidade ITASUL (vermelho, preto, branco, cinza, amarelo discreto)
  data/seed.js       etapas, ligações, caminhos, ideias da IA (hipóteses editáveis)
  state/store.js     estado, persistência, CRUD, histórico, import/export
  state/logic.js     funções puras: atrasos, filtros, indicadores, transferências
  ui/                dom.js (helpers) · form.js (modal) · map.js · panel.js · team.js · improvements.js
tests/unit/          testes do estado e da lógica (node:test)
tests/e2e/smoke.mjs  teste de interface em navegador real
tools/serve.mjs      servidor estático para desenvolvimento
```
Modelo: **etapas** (processos) ≠ **funcionários** (pessoas) ≠ **tarefas**. Uma pessoa liga-se a várias etapas por `stageIds`/responsável/substituto sem duplicar cadastro; uma etapa pode ter várias pessoas e tarefas.

## Status da primeira versão
**Funcional:** fluxo e ramais no mapa; painel por etapa; CRUD de tarefas (status, prioridade, prazo, atraso); CRUD de etapas (incl. ligações) e funcionários; vínculo pessoa↔etapa; sinalização de etapas sem responsável, tarefas atrasadas e bloqueadas; transferências entre setores; melhorias; filtros; backup/importação; layout responsivo.

**Depende de cadastro seu:** funcionários, responsáveis, responsabilidades, tarefas, problemas recorrentes, valores dos indicadores manuais, sugestões. O fluxo, as atividades e as entradas/saídas das etapas são hipóteses do briefing — revise.

**Pendente / fora do escopo desta versão:** compartilhamento entre usuários/dispositivos (dados ficam no navegador; hoje só via exportar/importar JSON); integração com TotalLoc/WhatsApp (não autorizada); arrastar nós para reposicionar; histórico por tarefa/funcionário (hoje há histórico por etapa e global); pinça de dois dedos no mapa (use os botões de zoom); autenticação/permissões.
