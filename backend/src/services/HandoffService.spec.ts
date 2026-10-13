import { randomUUID } from "node:crypto";
import { HandoffError, HandoffEvent, HandoffService } from "./HandoffService";
import { InMemoryEscalationsRepository } from "../repositories/escalationsRepository/implementations/InMemoryEscalationsRepository";
import { Message } from "../providers/LlmProvider/interfaces/ILlmProvider";

function setup() {
  const repository = InMemoryEscalationsRepository.getInstance();
  const appended: { sessionId: string; messages: Message[] }[] = [];
  const service = new HandoffService(repository, {
    append: (sessionId, messages) => appended.push({ sessionId, messages }),
  });
  const sessionId = randomUUID();
  const escalation = repository.create({
    customerName: "Ana",
    reason: "customer_requested_human",
    scenario: "Cliente pediu atendente",
    rootCauseAnalysis: "Pedido explícito",
    requestedAction: "Falar com uma pessoa",
    recommendations: [],
    sessionId,
  });
  return { repository, service, sessionId, escalation, appended };
}

function captureError(action: () => unknown): HandoffError {
  try {
    action();
  } catch (error) {
    return error as HandoffError;
  }
  throw new Error("esperava erro");
}

describe("HandoffService", () => {
  it("considera a sessão com humano enquanto a escalação não for resolvida", () => {
    const { service, sessionId, escalation } = setup();

    expect(service.isWithHuman(sessionId)).toBe(true);

    service.resolve(escalation.protocol, "Maria");

    expect(service.isWithHuman(sessionId)).toBe(false);
  });

  it("assume o atendimento e registra mensagem de sistema", () => {
    const { service, sessionId, escalation } = setup();

    const claimed = service.claim(escalation.protocol, "Maria");

    expect(claimed.status).toBe("in_progress");
    expect(claimed.assignee).toBe("Maria");
    expect(service.transcript(sessionId).at(-1)).toMatchObject({
      author: "system",
      content: "Maria entrou na conversa.",
    });
  });

  it("impede que outro atendente assuma ou responda", () => {
    const { service, escalation } = setup();
    service.claim(escalation.protocol, "Maria");

    expect(captureError(() => service.claim(escalation.protocol, "João")).status).toBe(409);
    expect(
      captureError(() => service.reply(escalation.protocol, "João", "Oi")).status,
    ).toBe(403);
  });

  it("exige assumir antes de responder", () => {
    const { service, escalation } = setup();

    const error = captureError(() =>
      service.reply(escalation.protocol, "Maria", "Olá"),
    );

    expect(error.status).toBe(409);
  });

  it("resposta do humano entra no transcript e no contexto da conversa", () => {
    const { service, sessionId, escalation, appended } = setup();
    service.claim(escalation.protocol, "Maria");

    const entry = service.reply(escalation.protocol, "Maria", "  Olá, Ana!  ");

    expect(entry).toMatchObject({ author: "human", authorName: "Maria", content: "Olá, Ana!" });
    expect(appended.at(-1)).toEqual({
      sessionId,
      messages: [{ role: "assistant", content: "Olá, Ana!" }],
    });
  });

  it("mensagem do cliente vai para o transcript e para o contexto", () => {
    const { service, sessionId, appended } = setup();

    service.receiveFromCustomer(sessionId, "Ainda estou aqui");

    expect(service.transcript(sessionId).at(-1)?.author).toBe("customer");
    expect(appended.at(-1)?.messages).toEqual([
      { role: "user", content: "Ainda estou aqui" },
    ]);
  });

  it("publica eventos para a sessão e para o console", () => {
    const { service, sessionId, escalation } = setup();
    const sessionEvents: HandoffEvent[] = [];
    const consoleEvents: HandoffEvent[] = [];
    const stopSession = service.subscribeSession(sessionId, (event) =>
      sessionEvents.push(event),
    );
    const stopConsole = service.subscribeConsole((event) =>
      consoleEvents.push(event),
    );

    service.claim(escalation.protocol, "Maria");
    stopSession();
    service.reply(escalation.protocol, "Maria", "Oi");
    stopConsole();

    expect(sessionEvents.map((event) => event.type)).toEqual([
      "escalation",
      "message",
    ]);
    expect(consoleEvents.map((event) => event.type)).toEqual([
      "escalation",
      "message",
      "message",
    ]);
  });

  it("devolve 404 para protocolo inexistente", () => {
    const { service } = setup();

    expect(captureError(() => service.details("ESC-9999")).status).toBe(404);
  });

  it("descarta transcripts ociosos sem escalação ativa", () => {
    const { service } = setup();
    const idleSession = randomUUID();
    service.record(idleSession, "customer", "oi");

    service.prune(Date.now() + 3 * 60 * 60 * 1_000);

    expect(service.transcript(idleSession)).toEqual([]);
  });
});
