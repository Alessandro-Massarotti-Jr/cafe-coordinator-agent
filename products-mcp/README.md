# products-mcp

Servidor [MCP](https://modelcontextprotocol.io) que expõe o catálogo de produtos
da Padaria Sabor de Pão. É consumido pelo agente de **Produtos** do backend, que
deixou de embutir as ferramentas localmente e passou a descobri-las via MCP.

## Ferramentas expostas

- `listProducts` — lista o cardápio (por padrão apenas os produtos disponíveis).
- `findProduct` — busca produtos por nome, categoria ou palavra-chave.
- `getProductDetails` — detalhes completos de um produto pelo código (ex.: `PROD-001`).

## Transporte

Streamable HTTP (stateless) em `POST /mcp`, na porta definida por `PORT` (padrão `3001`).

## Executando localmente

```bash
npm install
cp .env.sample .env
npm run start:dev
```

O backend se conecta usando a variável `PRODUCTS_MCP_URL` (ex.: `http://products-mcp:3001/mcp`).
