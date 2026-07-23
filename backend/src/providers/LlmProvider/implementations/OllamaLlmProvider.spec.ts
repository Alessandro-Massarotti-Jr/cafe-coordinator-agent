import { toStopReason } from "./OllamaLlmProvider";

const withToolCalls = {
  role: "assistant",
  content: "",
  tool_calls: [{ function: { name: "getOrder", arguments: {} } }],
};

const plain = { role: "assistant", content: "olá" };

describe("toStopReason", () => {
  it("infere tool_calls pela mensagem, não pelo done_reason", () => {
    expect(toStopReason("stop", withToolCalls)).toBe("tool_calls");
  });

  it("trata stop sem tool_calls como fim de turno", () => {
    expect(toStopReason("stop", plain)).toBe("end_turn");
  });

  it("trata length como truncado mesmo com tool_calls", () => {
    expect(toStopReason("length", withToolCalls)).toBe("truncated");
    expect(toStopReason("length", plain)).toBe("truncated");
  });

  it("trata load e unload como ausência de resposta", () => {
    expect(toStopReason("load", { role: "assistant", content: "" })).toBe(
      "no_completion",
    );
    expect(toStopReason("unload", { role: "assistant", content: "" })).toBe(
      "no_completion",
    );
  });

  it("trata done_reason ausente como desconhecido", () => {
    expect(toStopReason(undefined, plain)).toBe("unknown");
  });
});
