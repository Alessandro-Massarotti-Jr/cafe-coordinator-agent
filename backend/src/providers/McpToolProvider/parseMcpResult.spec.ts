import { parseMcpResult } from "./parseMcpResult";
import { adaptMcpResponse } from "./McpTool";

describe("parseMcpResult", () => {
  it("desserializa o JSON dos blocos de texto", () => {
    const result = parseMcpResult({
      content: [{ type: "text", text: '{"isError":false}' }],
    });

    expect(result).toEqual({ isError: false });
  });

  it("concatena múltiplos blocos de texto", () => {
    const result = parseMcpResult({
      content: [
        { type: "text", text: '{"a":' },
        { type: "text", text: "1}" },
      ],
    });

    expect(result).toEqual({ a: 1 });
  });

  it("devolve texto cru quando não é JSON", () => {
    expect(parseMcpResult({ content: [{ type: "text", text: "oi" }] })).toEqual({
      text: "oi",
    });
  });

  it("cai para structuredContent quando não há texto", () => {
    expect(parseMcpResult({ structuredContent: { a: 1 } })).toEqual({ a: 1 });
  });
});

describe("adaptMcpResponse", () => {
  it("repassa o envelope do MCP sem reembrulhar", () => {
    const envelope = {
      isError: false,
      message: "ok",
      userFriendlyMessage: "ok",
      data: { products: [] },
    };

    expect(adaptMcpResponse("listProducts", envelope)).toBe(envelope);
  });

  it("converte resposta fora do contrato em erro transiente", () => {
    const result = adaptMcpResponse("listProducts", { text: "oi" });

    expect(result.isError).toBe(true);
    expect(result.errorCategory).toBe("transient");
    expect(result.isRetryable).toBe(true);
  });
});
