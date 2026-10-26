// Identidade de cor por setor. Setores conhecidos têm cor fixa; setores criados pelo usuário recebem uma das 6 cores extras
// de forma estável (hash do nome). As cores em si ficam no CSS (tokens claro/escuro): aqui só se escolhe a classe.
const KNOWN = { 'Marketing': 'marketing', 'Atendimento': 'atendimento', 'Comercial': 'comercial', 'Operação': 'operacao', 'Financeiro': 'financeiro', 'Manutenção': 'manutencao', 'Pós-venda': 'posvenda' };
export const sectorSlug = (name) => {
  if (KNOWN[name]) return KNOWN[name];
  let h = 0; for (const ch of String(name ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `x${h % 6}`;
};
export const sectorClass = (name) => `sec-${sectorSlug(name)}`;
export const KNOWN_SECTORS = Object.keys(KNOWN);
