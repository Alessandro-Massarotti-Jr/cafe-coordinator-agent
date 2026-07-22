import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listProductsController } from "./usecases/ListProductsUseCase";
import { getProductDetailsController } from "./usecases/GetProductDetailsUseCase";
import { findProductController } from "./usecases/FindProductUseCase";
import { ToolResponse } from "./domain/ToolResponse";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import express from "express";

function toCallToolResult(response: ToolResponse) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(response) }],
  };
}

export function createProductsMcpServer(): McpServer {
  const server = new McpServer({
    name: "products-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "listProducts",
    {
      title: "Listar produtos",
      description:
        "Lista os produtos do cardápio da padaria com preço, estoque e disponibilidade. Use para responder 'o que vocês têm?' ou mostrar o catálogo.",
      inputSchema: {
        includeUnavailable: z
          .boolean()
          .optional()
          .describe(
            "Se true, inclui também os produtos sem estoque. Padrão: false (apenas disponíveis).",
          ),
      },
    },
    async (params) =>
      toCallToolResult(await listProductsController.handle(params)),
  );

  server.registerTool(
    "findProduct",
    {
      title: "Buscar produto",
      description:
        "Busca produtos do cardápio por nome, categoria ou palavra-chave (ex.: 'chocolate', 'café', 'pão'). Retorna os produtos que combinam com o termo.",
      inputSchema: {
        term: z
          .string()
          .describe("Termo de busca (nome, categoria ou palavra-chave)"),
      },
    },
    async (params) =>
      toCallToolResult(await findProductController.handle(params)),
  );

  server.registerTool(
    "getProductDetails",
    {
      title: "Detalhes do produto",
      description:
        "Retorna os detalhes completos de um produto específico a partir do seu código (ex.: 'PROD-001'): preço, estoque, descrição e disponibilidade.",
      inputSchema: {
        productId: z.string().describe("Código do produto (ex.: PROD-001)"),
      },
    },
    async (params) =>
      toCallToolResult(await getProductDetailsController.handle(params)),
  );

  return server;
}

const server = express();
server.use(express.json());

server.all("/mcp", async (req, res) => {
  const server = createProductsMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Erro ao processar requisição MCP:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

export { server };
