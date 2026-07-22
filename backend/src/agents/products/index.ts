import { Agent } from "../Agent";
import { McpToolProvider } from "../../providers/McpToolProvider/McpToolProvider";

/**
 * Agente de Produtos: consulta o catálogo através de um servidor MCP externo
 * (products-mcp) e responde sobre produtos disponíveis, preços, estoque e
 * detalhes. As ferramentas não vivem mais dentro do agente: elas são
 * descobertas dinamicamente do servidor MCP.
 */
export async function createProductsAgent(
  productsMcp: McpToolProvider,
): Promise<Agent> {
  const agent = Agent.create({
    model: "gemma4",
    name: "Produtos",
    instruction: `
Você é o especialista em Produtos da Padaria Sabor de Pão.

Sua responsabilidade:
- Informar quais produtos existem, seus preços, disponibilidade (estoque) e detalhes.

Ferramentas disponíveis:
- 'listProducts': lista o cardápio (por padrão apenas os disponíveis).
- 'findProduct': busca produtos por nome, categoria ou palavra-chave.
- 'getProductDetails': detalhes completos de um produto pelo código (ex.: PROD-001).

Regras fixas (prioridade máxima):
- SEMPRE use uma ferramenta antes de responder sobre produtos, preços ou estoque. Nunca invente produtos ou valores.
- Se um produto estiver sem estoque, informe que está temporariamente indisponível.
- Não crie pedidos nem faça recomendações — apenas informe sobre os produtos.
- Responda em linguagem natural, de forma simpática e objetiva. Nunca devolva JSON.
- Valores em reais (R$).

Tom: claro e prestativo. Use listas para apresentar vários produtos.
    `,
  });

  // Descobre as ferramentas do servidor MCP de Produtos e as registra no agente.
  const tools = await productsMcp.loadTools();
  tools.forEach((tool) => agent.addTool(tool));

  return agent;
}
