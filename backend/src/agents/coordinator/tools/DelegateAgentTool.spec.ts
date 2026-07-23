import { DelegateAgentTool } from "./DelegateAgentTool";
import { Agent } from "../../Agent";
import { AgentModel } from "../../AgentModel";
import { AgentRunner, RunResult } from "../../../services/AgentRunner";
import { CustomerMemoryStore } from "../../../services/CustomerMemoryStore";

const specialist = Agent.create({
  name: "Produtos",
  model: AgentModel.Gemma4,
  instruction: "especialista de teste",
});

function runnerReturning(result: Partial<RunResult>): AgentRunner {
  return {
    run: async () => ({
      content: "",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      stopReason: "end_turn",
      degraded: false,
      limitReached: false,
      iterations: 0,
      failures: [],
      ...result,
    }),
  } as unknown as AgentRunner;
}

function failingRunner(message: string): AgentRunner {
  return {
    run: async () => {
      throw new Error(message);
    },
  } as unknown as AgentRunner;
}

function makeTool(runner: AgentRunner) {
  return DelegateAgentTool.create({
    name: "askProducts",
    description: "delega",
    agent: specialist,
    runner,
  });
}

describe("DelegateAgentTool", () => {
  it("devolve a resposta do especialista em caso de sucesso", async () => {
    const tool = makeTool(runnerReturning({ content: "temos bolo" }));

    const result = await tool.execute({ task: "liste os doces" });

    expect(result.isError).toBe(false);
    expect(result.data?.response).toBe("temos bolo");
  });

  it("recusa tarefa vazia com validation", async () => {
    const tool = makeTool(runnerReturning({ content: "x" }));

    const result = await tool.execute({ task: "   " });

    expect(result.errorCategory).toBe("validation");
  });

  it("não deixa a exceção do subagente subir e entrega falha estruturada", async () => {
    const tool = makeTool(failingRunner("products-mcp fora do ar"));

    const result = await tool.execute({ task: "liste os doces" });

    expect(result.isError).toBe(true);
    expect(result.errorCategory).toBe("transient");
    expect(result.data?.specialist).toBe("Produtos");
    expect(result.data?.task).toBe("liste os doces");
    expect(result.data?.partialResults).toEqual([]);
    expect(result.data?.failures).toEqual(["products-mcp fora do ar"]);
    expect(result.message).toContain("products-mcp fora do ar");
  });

  it("sinaliza resultado parcial sem marcar erro", async () => {
    const tool = makeTool(
      runnerReturning({
        content: "achei parte do cardápio",
        degraded: true,
        failures: ["listProducts: timeout"],
      }),
    );

    const result = await tool.execute({ task: "liste os doces" });

    expect(result.isError).toBe(false);
    expect(result.message).toContain("PARCIAL");
    expect(result.data?.partialResults).toEqual(["achei parte do cardápio"]);
  });
});

describe("CustomerMemoryStore", () => {
  it("guarda e recupera as últimas interações do cliente", () => {
    const store = new CustomerMemoryStore(2);

    store.remember("ana", "pediu espresso");
    store.remember("ana", "pediu bolo");
    store.remember("ana", "cancelou ORD-0001");

    expect(store.recall("ana")).toEqual(["pediu bolo", "cancelou ORD-0001"]);
  });

  it("monta contexto legível ou null quando não há memória", () => {
    const store = new CustomerMemoryStore();

    expect(store.asContext("ana")).toBeNull();
    store.remember("ana", "pediu espresso");
    expect(store.asContext("ana")).toContain("pediu espresso");
  });
});
