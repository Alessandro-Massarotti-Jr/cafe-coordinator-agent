import { EscalateToHumanTool } from "./EscalateToHumanTool";
import { InMemoryEscalationsRepository } from "../../../repositories/escalationsRepository/implementations/InMemoryEscalationsRepository";

function validPayload() {
  return {
    customerName: "Ana",
    reason: "customer_requested_human",
    scenario: "Cliente pediu atendente humano",
    rootCauseAnalysis: "Pedido explícito, sem tentativa anterior falha",
    requestedAction: "Falar com uma pessoa",
    recommendations: ["Retornar contato pelo WhatsApp"],
  };
}

describe("EscalateToHumanTool", () => {
  it("persiste a escalação e devolve protocolo", async () => {
    const repository = InMemoryEscalationsRepository.getInstance();
    const before = repository.findAll().length;
    const tool = EscalateToHumanTool.create(repository);

    const result = await tool.execute(validPayload());

    expect(result.isError).toBe(false);
    expect(result.data?.protocol).toMatch(/^ESC-\d{4}$/);
    expect(repository.findAll().length).toBe(before + 1);
    expect(result.userFriendlyMessage).toContain(result.data!.protocol);
  });

  it("recusa payload incompleto com validation", async () => {
    const tool = EscalateToHumanTool.create(
      InMemoryEscalationsRepository.getInstance(),
    );

    const result = await tool.execute({
      ...validPayload(),
      rootCauseAnalysis: "",
    });

    expect(result.errorCategory).toBe("validation");
  });

  it("recusa motivo fora do enum", async () => {
    const tool = EscalateToHumanTool.create(
      InMemoryEscalationsRepository.getInstance(),
    );

    const result = await tool.execute({
      ...validPayload(),
      reason: "cliente_chateado",
    });

    expect(result.errorCategory).toBe("validation");
  });
});
