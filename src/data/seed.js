// Dados iniciais do painel. Tudo aqui é HIPÓTESE editável vinda do briefing:
// nenhum responsável, número, valor financeiro ou resultado real é pré-cadastrado.

export const SECTORS = ['Marketing', 'Atendimento', 'Comercial', 'Operação', 'Financeiro', 'Manutenção', 'Pós-venda'];
export const STATUSES = ['Pendente', 'Em andamento', 'Aguardando terceiros', 'Bloqueada', 'Concluída'];
export const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];
export const IMPROVEMENT_STATUSES = ['Nova', 'Em avaliação', 'Aprovada', 'Em execução', 'Rejeitada'];
export const RECORD_KINDS = ['Orçamento', 'Locação', 'Entrega', 'Pendência financeira', 'Equipamento indisponível', 'Manutenção'];
export const RECORD_STATUSES = ['Aberto', 'Aguardando retorno', 'Programado', 'Em andamento', 'Concluído', 'Cancelado'];
export const LEVELS = ['Baixo', 'Médio', 'Alto'];

const stage = (n, id, name, sector, x, y, objective, activities, inputs, outputs, kpis) => ({
  id, kind: 'stage', num: n, name, sector, x, y, objective, activities, inputs, outputs, kpis,
  responsibilities: [], problems: [], ownerId: null, substituteId: null, notes: '',
});

// Layout em serpentina (sem cruzamento de setas): linha 1 → direita, linha 2 ← esquerda, linha 3 ramifica da etapa 7.
export const COL = 330, ROW = 210, X0 = 40, Y0 = 230;
const at = (c, r) => [X0 + c * COL, Y0 + r * ROW];

export const SEED_STAGES = [
  stage(1, 's1', 'Marketing e geração de demanda', 'Marketing', ...at(1, 0),
    'Fazer potenciais clientes conhecerem a ITASUL e solicitar um orçamento.',
    ['Publicações em redes sociais', 'Divulgação de equipamentos e caçambas', 'Atendimento de contatos vindos das campanhas', 'Parcerias com depósitos de materiais de construção', 'Relacionamento com pedreiros, empreiteiros e construtoras', 'Campanhas promocionais', 'Registro da origem dos contatos'],
    ['Portfólio de equipamentos e serviços', 'Objetivos comerciais do período'],
    ['Contato interessado com origem registrada'],
    ['Contatos gerados', 'Orçamentos originados por campanha', 'Conversão de contatos em locações']),
  stage(2, 's2', 'Entrada do cliente', 'Atendimento', ...at(2, 0),
    'Registrar a necessidade do cliente.',
    ['Receber solicitação por atendimento presencial, telefone/WhatsApp, Instagram e outras redes, indicação de parceiros ou cliente recorrente', 'Registrar: cliente, contato, equipamento/serviço, data desejada, origem do contato e próxima ação'],
    ['Contato interessado com origem registrada', 'Clientes recorrentes e indicações'],
    ['Solicitação registrada com próxima ação definida'],
    ['Solicitações registradas', 'Solicitações com origem informada']),
  stage(3, 's3', 'Recepção e atendimento', 'Atendimento', ...at(3, 0),
    'Compreender a demanda e encaminhar corretamente.',
    ['Receber o cliente', 'Identificar o equipamento ou serviço necessário', 'Verificar as informações da solicitação', 'Consultar disponibilidade ou encaminhar para quem possa confirmar', 'Registrar o contato e o próximo passo', 'Encaminhar dúvidas técnicas ou comerciais'],
    ['Solicitação registrada com próxima ação definida'],
    ['Demanda compreendida e encaminhada ao comercial'],
    ['Tempo até o primeiro retorno', 'Solicitações encaminhadas sem retrabalho']),
  stage(4, 's4', 'Comercial e orçamento', 'Comercial', ...at(4, 0),
    'Transformar a solicitação em oportunidade de locação.',
    ['Identificar o equipamento adequado', 'Confirmar disponibilidade com o responsável', 'Elaborar e enviar orçamento', 'Explicar condições de locação', 'Fazer acompanhamento comercial', 'Registrar negociação, objeções e resultado', 'Encaminhar para fechamento'],
    ['Demanda compreendida e encaminhada ao comercial', 'Confirmação de disponibilidade'],
    ['Orçamento enviado e resultado da negociação registrado'],
    ['Orçamentos enviados', 'Orçamentos aguardando retorno', 'Taxa de conversão de orçamentos']),
  stage(5, 's5', 'Disponibilidade e preparação', 'Operação', ...at(4, 1),
    'Garantir que o equipamento ou serviço possa ser entregue conforme combinado.',
    ['Verificar disponibilidade', 'Confirmar condições do equipamento', 'Verificar manutenção pendente', 'Programar preparação e separação', 'Identificar impedimentos', 'Confirmar prazo e condições operacionais'],
    ['Pedido de verificação vindo do comercial', 'Equipamentos liberados pela manutenção'],
    ['Disponibilidade confirmada e equipamento preparado'],
    ['Equipamentos indisponíveis', 'Impedimentos identificados antes da entrega']),
  stage(6, 's6', 'Fechamento e registro da locação', 'Comercial', ...at(3, 1),
    'Formalizar o negócio.',
    ['Confirmar condições aprovadas', 'Registrar a locação', 'Preparar contrato ou documentação aplicável', 'Registrar prazo, valores e condições de pagamento', 'Confirmar os dados necessários para execução', 'Comunicar os setores envolvidos'],
    ['Orçamento aprovado', 'Disponibilidade confirmada'],
    ['Locação registrada e setores comunicados'],
    ['Locações registradas', 'Locações sem documentação completa']),
  stage(7, 's7', 'Operação, entrega e retirada', 'Operação', ...at(2, 1),
    'Executar o serviço contratado.',
    ['Programar entrega ou retirada', 'Definir responsável pela execução', 'Conferir o equipamento e os acessórios', 'Registrar entrega, devolução e ocorrências', 'Comunicar atrasos ou impedimentos', 'Confirmar conclusão do serviço'],
    ['Locação registrada e setores comunicados'],
    ['Serviço executado e ocorrências registradas'],
    ['Entregas previstas', 'Entregas no prazo', 'Ocorrências registradas']),
  stage(8, 's8', 'Financeiro e faturamento', 'Financeiro', ...at(1, 1),
    'Garantir o registro correto da receita e dos recebimentos. Valor orçado, contratado, faturado e efetivamente recebido são coisas distintas.',
    ['Conferir valores e condições acordadas', 'Registrar cobrança e vencimentos', 'Acompanhar pagamentos', 'Registrar pendências financeiras', 'Conciliar informações com a locação', 'Sinalizar divergências'],
    ['Locação registrada e setores comunicados', 'Serviço executado e ocorrências registradas'],
    ['Cobrança registrada e recebimentos conciliados'],
    ['Pendências financeiras', 'Divergências sinalizadas']),
  stage(9, 's9', 'Devolução e inspeção', 'Operação', ...at(2, 2),
    'Concluir a locação e verificar o estado do equipamento.',
    ['Registrar devolução', 'Conferir o estado do equipamento', 'Registrar danos, faltas ou ocorrências', 'Encaminhar para manutenção quando necessário', 'Atualizar a disponibilidade', 'Encaminhar eventuais pendências ao setor responsável'],
    ['Serviço executado e ocorrências registradas'],
    ['Equipamento inspecionado, disponibilidade atualizada e pendências encaminhadas'],
    ['Devoluções inspecionadas', 'Equipamentos devolvidos com dano']),
  stage(10, 's10', 'Pós-venda e fidelização', 'Pós-venda', ...at(1, 2),
    'Transformar uma locação concluída em relacionamento duradouro.',
    ['Confirmar satisfação', 'Solicitar feedback', 'Resolver reclamações', 'Identificar novas necessidades', 'Registrar oportunidade de nova locação', 'Solicitar avaliação ou indicação, quando apropriado'],
    ['Locação concluída e inspecionada'],
    ['Feedback registrado e oportunidades de nova locação identificadas'],
    ['Feedbacks recebidos', 'Reclamações resolvidas', 'Clientes que locaram novamente']),
  stage(11, 's11', 'Manutenção e retorno à disponibilidade', 'Manutenção', ...at(4, 2),
    'Manter a frota segura e pronta para novas locações.',
    ['Registrar defeitos', 'Diagnosticar problemas', 'Definir prioridade', 'Identificar peças e materiais necessários', 'Atribuir responsável', 'Acompanhar o reparo', 'Registrar testes e liberação', 'Atualizar o estado do equipamento'],
    ['Equipamento encaminhado pela inspeção, com defeito descrito'],
    ['Equipamento testado, liberado e disponibilidade atualizada'],
    ['Manutenções pendentes', 'Tempo de equipamento parado', 'Retrabalho em reparos']),
  // Nós de ramal (específicos de um serviço)
  { id: 'b_munck', kind: 'branch', num: null, name: 'Análise das necessidades da operação (Munck)', sector: 'Comercial', x: X0 + 3.5 * COL, y: 40,
    objective: 'Entender o que a operação com caminhão Munck exige antes de orçar.',
    activities: ['Levantar local, carga e altura/alcance necessários', 'Verificar restrições de acesso', 'Definir condições de execução para o orçamento'],
    inputs: ['Solicitação de serviço com Munck'], outputs: ['Necessidades da operação documentadas'], kpis: [],
    responsibilities: [], problems: [], ownerId: null, substituteId: null, notes: '' },
  { id: 'b_dest', kind: 'branch', num: null, name: 'Destinação adequada e encerramento (caçambas)', sector: 'Operação', x: X0, y: Y0 + ROW,
    objective: 'Garantir a destinação adequada do entulho retirado e encerrar o serviço da caçamba.',
    activities: ['Conferir a destinação do material retirado', 'Registrar encerramento do serviço', 'Liberar a caçamba para nova locação'],
    inputs: ['Caçamba retirada e registro financeiro'], outputs: ['Serviço de caçamba encerrado'], kpis: [],
    responsibilities: [], problems: [], ownerId: null, substituteId: null, notes: '' },
];

export const SEED_EDGES = [
  ['s1', 's2'], ['s2', 's3'], ['s3', 's4'], ['s4', 's5'], ['s5', 's6'], ['s6', 's7'], ['s7', 's8'],
  ['s7', 's9'], ['s9', 's10'], ['s9', 's11'], ['s11', 's5'],
  ['s3', 'b_munck'], ['b_munck', 's4'], ['s8', 'b_dest'],
].map(([from, to]) => ({ from, to, ...(from === 's11' && to === 's5' ? { loop: true } : {}) })); // loop = retorno (não é dependência bloqueante)

export const SEED_PATHS = [
  { id: 'cacambas', name: 'Caçambas', steps: [['Solicitação', 's2'], ['Orçamento', 's4'], ['Disponibilidade da caçamba', 's5'], ['Agendamento', 's7'], ['Entrega', 's7'], ['Retirada', 's7'], ['Registro financeiro', 's8'], ['Destinação adequada e encerramento', 'b_dest']] },
  { id: 'equipamentos', name: 'Equipamentos', steps: [['Solicitação', 's2'], ['Orçamento', 's4'], ['Disponibilidade', 's5'], ['Preparação', 's5'], ['Contrato', 's6'], ['Entrega ou retirada', 's7'], ['Devolução', 's9'], ['Inspeção', 's9']] },
  { id: 'munck', name: 'Caminhão Munck', steps: [['Solicitação', 's2'], ['Análise das necessidades', 'b_munck'], ['Orçamento', 's4'], ['Disponibilidade e condições de execução', 's5'], ['Agendamento', 's7'], ['Execução', 's7'], ['Registro financeiro', 's8']] },
  { id: 'manutencao', name: 'Manutenção', steps: [['Defeito identificado', 's9'], ['Equipamento bloqueado (se necessário)', 's11'], ['Diagnóstico', 's11'], ['Peças', 's11'], ['Reparo', 's11'], ['Teste de segurança', 's11'], ['Liberação', 's11']] },
].map((p) => ({ ...p, steps: p.steps.map(([label, stageId]) => ({ label, stageId })) }));

// Ideias da IA: NÃO são decisões aprovadas. Ficam separadas e só viram sugestão se o usuário adotar.
export const AI_SUGGESTIONS = [
  { id: 'ai1', title: 'Registrar a origem de todo contato na entrada', problem: 'Sem origem registrada não é possível medir quais campanhas geram orçamento.', idea: 'Campo obrigatório "origem do contato" no registro da solicitação.', stageId: 's2' },
  { id: 'ai2', title: 'Checklist padrão de devolução', problem: 'Danos e faltas podem não ser registrados de forma uniforme.', idea: 'Checklist único (estado, acessórios, fotos) na devolução e inspeção.', stageId: 's9' },
  { id: 'ai3', title: 'Bloqueio visível de equipamento em manutenção', problem: 'Risco de prometer ao cliente um equipamento indisponível.', idea: 'Marcar equipamento como bloqueado assim que o defeito for registrado, visível ao comercial.', stageId: 's11' },
  { id: 'ai4', title: 'Separar valor orçado, contratado, faturado e recebido', problem: 'Misturar esses valores distorce a leitura financeira.', idea: 'Quatro campos distintos no registro da locação.', stageId: 's8' },
  { id: 'ai5', title: 'Rotina de retorno após orçamento enviado', problem: 'Orçamentos podem ficar sem acompanhamento.', idea: 'Definir prazo padrão de retorno e registrar o resultado (fechou, perdeu, motivo).', stageId: 's4' },
  { id: 'ai6', title: 'Pedido de feedback após cada locação concluída', problem: 'Oportunidades de nova locação e indicação podem ser perdidas.', idea: 'Contato padrão de pós-venda com registro do resultado.', stageId: 's10' },
];

export const METRIC_DEFS = [
  { key: 'quotesOpen', label: 'Solicitações de orçamento abertas', manual: true },
  { key: 'quotesAwaiting', label: 'Orçamentos aguardando retorno', manual: true },
  { key: 'rentalsActive', label: 'Locações em andamento', manual: true },
  { key: 'deliveriesPlanned', label: 'Entregas previstas', manual: true },
  { key: 'financePending', label: 'Pendências financeiras', manual: true },
  { key: 'equipmentDown', label: 'Equipamentos indisponíveis', manual: true },
  { key: 'maintenancePending', label: 'Manutenções pendentes', manual: false },
  { key: 'tasksOverdue', label: 'Tarefas atrasadas', manual: false },
  { key: 'improvementsReview', label: 'Sugestões em avaliação', manual: false },
];

export const STATE_VERSION = 3;

export function createInitialState() {
  return {
    version: STATE_VERSION,
    stages: structuredClone(SEED_STAGES),
    edges: structuredClone(SEED_EDGES),
    paths: structuredClone(SEED_PATHS),
    tasks: [], employees: [], improvements: [], records: [],
    metrics: {}, history: [],
  };
}
