import { Agent } from "../Agent";
import { ListProductsTool } from "./tools/ListProductsTool";
import { FindProductTool } from "./tools/FindProductTool";
import { GetProductDetailsTool } from "./tools/GetProductDetailsTool";
import { IProductsRepository } from "../../repositories/productsRepository/interfaces/IProductsRepository";

/**
 * Agente de Produtos: consulta o catálogo (banco em memória) e responde sobre
 * produtos disponíveis, preços, estoque e detalhes.
 */
export function createProductsAgent(
  productsRepository: IProductsRepository,
): Agent {
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

  agent.addTool(ListProductsTool.create(productsRepository));
  agent.addTool(FindProductTool.create(productsRepository));
  agent.addTool(GetProductDetailsTool.create(productsRepository));

  return agent;
}
