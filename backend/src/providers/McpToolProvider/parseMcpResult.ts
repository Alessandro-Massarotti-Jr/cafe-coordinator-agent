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
