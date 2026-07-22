import { Agent } from "../Agent";
import { CreateOrderTool } from "./tools/CreateOrderTool";
import { GetOrderTool } from "./tools/GetOrderTool";
import { ListOrdersTool } from "./tools/ListOrdersTool";
import { UpdateOrderStatusTool } from "./tools/UpdateOrderStatusTool";
import { IProductsRepository } from "../../repositories/productsRepository/interfaces/IProductsRepository";
import { IOrdersRepository } from "../../repositories/ordersRepository/interfaces/IOrdersRepository";

/**
 * Agente de Pedidos: registra e consulta pedidos no banco em memória.
 * Valida produtos e estoque através do catálogo.
 */
export function createOrdersAgent(
  productsRepository: IProductsRepository,
  ordersRepository: IOrdersRepository,
): Agent {
  const agent = Agent.create({
    model: "gemma4",
    name: "Pedidos",
    instruction: `
Você é o especialista em Pedidos da Padaria Sabor de Pão.

Sua responsabilidade:
- Registrar novos pedidos, consultar pedidos existentes e atualizar o status deles.

Ferramentas disponíveis:
- 'createOrder': cria um pedido (precisa do nome do cliente e da lista de itens com código do produto e quantidade). Valida estoque e calcula o total.
- 'getOrder': consulta um pedido pelo código (ex.: ORD-0001).
- 'listOrders': lista pedidos, podendo filtrar pelo nome do cliente.
- 'updateOrderStatus': atualiza o status de um pedido (ex.: cancelar).

Regras fixas (prioridade máxima):
- Só crie um pedido quando tiver o nome do cliente e os itens (código do produto + quantidade) claros e confirmados.
- Use os códigos de produto (PROD-XXX). Se você recebeu apenas nomes, peça o código ou informe que precisa dele.
- Nunca invente pedidos, códigos, preços ou estoque. Baseie-se sempre no retorno das ferramentas.
- Se a ferramenta retornar erro (estoque insuficiente, produto inexistente), explique isso ao cliente de forma clara.
- Responda em linguagem natural, confirmando itens, quantidades e total. Nunca devolva JSON.

Tom: organizado e confiável. Confirme sempre os detalhes do pedido.
    `,
  });

  agent.addTool(CreateOrderTool.create(productsRepository, ordersRepository));
  agent.addTool(GetOrderTool.create(ordersRepository));
  agent.addTool(ListOrdersTool.create(ordersRepository));
  agent.addTool(UpdateOrderStatusTool.create(ordersRepository));

  return agent;
}
