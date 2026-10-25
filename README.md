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
- **Painel lateral amplo** (clique numa etapa) — a aba **Visão completa** reúne objetivo, responsável (principal/substituto), pendências, tarefas (adicionar, editar, concluir, reabrir), entradas e entregas (com links para as etapas vizinhas e aviso ⇄ de transferência entre setores), indicadores, sugestões de melhoria e atividades previstas. As demais abas (Responsabilidades, Tarefas, Responsáveis, Entradas e entregas, Indicadores, Problemas, Melhorias, Histórico) detalham/editam cada parte. Na aba **Responsáveis** dá para vincular/desvincular pessoas e cadastrar um funcionário novo já ligado à etapa. Vincular **não** define responsável: isso é sempre uma escolha explícita.
- **Registros** — orçamentos, locações, entregas, pendências financeiras, equipamentos indisponíveis e manutenções, com status, data, etapa e responsável. **Sem valores financeiros nem dados pessoais.** São a base dos indicadores.
- **Rotina diária** — tarefas por funcionário e por dia (‹ › e seletor de data), com filtros **Pendentes / Concluídas / Atrasadas / Bloqueadas**. Mostra as tarefas com prazo no dia, as anteriores ainda abertas e as sem prazo; permite criar, editar, concluir e reabrir ali mesmo. "A definir" lista tarefas sem responsável. Só aparece o que foi cadastrado; nada é atribuído automaticamente.
- **Dependências** — cada ligação do mapa é uma dependência: a etapa anterior só conta como *concluída* se tiver tarefas e todas estiverem concluídas. Se tiver tarefas em aberto, a etapa seguinte mostra ⏳ no mapa, a seta fica pontilhada, o painel diz "etapa anterior NÃO concluída" e o indicador "Etapas aguardando etapa anterior" a lista. Sem tarefas na anterior, o painel avisa que não dá para verificar. Ramais (Munck, destinação) são dependências opcionais e não geram alerta.
- **Equipe e Responsabilidades** — cada funcionário mostra cargo e setor ("A definir" se faltar), papel em cada etapa (principal / substituto / participa), tarefas atribuídas com contagem de pendentes, atrasadas e bloqueadas, e atalhos para nova tarefa e rotina. Abaixo: tarefas sem responsável, cobertura por etapa e a **tabela de transferências de responsabilidade entre setores** (origem, destino, entrega exigida, situação). Antes: cadastro único de funcionários vinculados a várias etapas, hierarquia por "quem coordena" e tabela de cobertura (quem responde por cada etapa; "A definir" em destaque).
- **Central de Melhorias** — sugestões com todos os campos pedidos, vínculo a etapa/tarefa/funcionário, filtro por status. Ideias da IA ficam numa seção separada, marcadas como não aprovadas; só viram sugestão (status "Nova") se você clicar em adotar.
- **Indicadores no topo** — todos calculados dos registros existentes e **clicáveis** (abrem a lista dos itens, com atalho para editar/registrar). "Sem dados registrados" quando não há nenhum registro do tipo; `0` só quando existem registros mas nenhum ativo.
  - Orçamentos abertos = Orçamento `Aberto` · aguardando retorno = Orçamento `Aguardando retorno` · Locações em andamento = Locação `Em andamento` · Entregas previstas = Entrega `Aberto`/`Programado` · Pendências financeiras / Equipamentos indisponíveis = registros do tipo não concluídos/cancelados · Manutenções pendentes = tarefas abertas da etapa 11 + registros "Manutenção" ativos · Tarefas atrasadas, pendentes e bloqueadas = das tarefas · Sugestões em avaliação = das melhorias.
  - Compatibilidade: um valor informado manualmente (versão anterior) continua valendo só enquanto não houver registros do tipo, e aparece marcado como manual.
- **Filtros** por setor, responsável, status e prioridade (etapas que não casam ficam esmaecidas).

## Dados e segurança
- Dados de versões anteriores são **migrados automaticamente** (v1 → v2): nada é apagado; apenas é adicionada a lista de registros e as etapas padrão voltam à nova posição (etapas criadas por você ficam abaixo do mapa).
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
  ui/                dom.js (helpers) · form.js (modal) · map.js · panel.js · team.js · improvements.js · records.js
tests/unit/          estado, lógica, migração e geometria do layout (node:test)
tests/e2e/smoke.mjs  teste de interface em navegador real (fluxo geral)
tests/e2e/gestao.mjs teste de interface: funcionários, tarefas, rotina, dependências, indicadores
tools/serve.mjs      servidor estático para desenvolvimento
```
Modelo: **etapas** (processos) ≠ **funcionários** (pessoas) ≠ **tarefas**. Uma pessoa liga-se a várias etapas por `stageIds`/responsável/substituto sem duplicar cadastro; uma etapa pode ter várias pessoas e tarefas.

## Status
**Funcional:** tudo da primeira versão, mais painel amplo consolidado, reabrir tarefas, vínculo de pessoas pelo painel, registros operacionais, indicadores calculados e clicáveis, layout em serpentina sem cruzamento de setas, navegação entre etapas vizinhas.

**Depende de cadastro seu:** funcionários, responsáveis (todas as etapas começam "A definir"), responsabilidades, tarefas, registros, problemas recorrentes, sugestões. Fluxo, atividades e entradas/saídas das etapas são hipóteses do briefing — revise.

**Pendente / fora do escopo:** compartilhamento entre usuários/dispositivos (dados ficam no navegador; use exportar/importar), integração com TotalLoc/WhatsApp (não autorizada), arrastar etapas para reposicionar, histórico por tarefa/funcionário, zoom por pinça, login e permissões. Tarefas recorrentes (frequência "Diária" etc.) são um rótulo: concluir marca a tarefa inteira, não cada ocorrência.
