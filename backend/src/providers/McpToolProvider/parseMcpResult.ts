/**
 * Extrai o payload de um resultado retornado por uma ferramenta MCP. As tools
 * deste servidor devolvem o JSON da resposta dentro de um bloco de texto;
 * tentamos desserializá-lo de volta para um objeto — mantendo o mesmo contrato
 * das tools locais.
 */
export function parseMcpResult(result: any): unknown {
  const content = Array.isArray(result?.content) ? result.content : [];
  const text = content
    .filter((block: any) => block?.type === "text")
    .map((block: any) => block.text)
    .join("");

  if (!text) {
    return result?.structuredContent ?? { error: "Resposta vazia do MCP." };
  }

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}
