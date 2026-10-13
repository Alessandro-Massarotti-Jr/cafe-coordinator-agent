import { Request, Response, Router } from "express";
import {
  HandoffError,
  HandoffEvent,
  HandoffService,
} from "../services/HandoffService";
import { openSseStream, sendEvent, startHeartbeat } from "./sse";

function handle(
  res: Response,
  action: () => unknown,
  successStatus = 200,
): void {
  try {
    res.status(successStatus).json(action());
  } catch (error) {
    if (error instanceof HandoffError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
}

function isLiveForCustomer(event: HandoffEvent): boolean {
  return (
    event.type === "message" &&
    (event.entry.author === "human" || event.entry.author === "system")
  );
}

function streamEvents(
  req: Request,
  res: Response,
  subscribe: (listener: (event: HandoffEvent) => void) => () => void,
  initial: () => { event: string; data: object },
): void {
  openSseStream(res);
  const stopHeartbeat = startHeartbeat(res);

  let eventId = 0;
  const emit = (event: string, data: object) =>
    sendEvent(res, { id: ++eventId, event, data });

  const snapshot = initial();
  emit(snapshot.event, snapshot.data);

  const unsubscribe = subscribe((event) => {
    if (event.type === "message") emit("message", event.entry);
    else emit("escalation", event.escalation);
  });

  req.on("close", () => {
    unsubscribe();
    stopHeartbeat();
  });
}

export function createHandoffRoutes(handoff: HandoffService): Router {
  const router = Router();

  router.get("/escalations", (_req, res) => {
    res.json({ escalations: handoff.listEscalations() });
  });

  router.get("/escalations/stream", (req, res) => {
    streamEvents(
      req,
      res,
      (listener) => handoff.subscribeConsole(listener),
      () => ({
        event: "snapshot",
        data: { escalations: handoff.listEscalations() },
      }),
    );
  });

  router.get("/escalations/:protocol", (req, res) => {
    handle(res, () => handoff.details(req.params.protocol));
  });

  router.post("/escalations/:protocol/claim", (req, res) => {
    const { agentName } = (req.body ?? {}) as { agentName?: string };
    handle(res, () => ({
      escalation: handoff.claim(req.params.protocol, agentName ?? ""),
    }));
  });

  router.post("/escalations/:protocol/messages", (req, res) => {
    const { agentName, content } = (req.body ?? {}) as {
      agentName?: string;
      content?: string;
    };
    handle(
      res,
      () => ({
        entry: handoff.reply(
          req.params.protocol,
          agentName ?? "",
          content ?? "",
        ),
      }),
      201,
    );
  });

  router.post("/escalations/:protocol/resolve", (req, res) => {
    const { agentName } = (req.body ?? {}) as { agentName?: string };
    handle(res, () => ({
      escalation: handoff.resolve(req.params.protocol, agentName ?? ""),
    }));
  });

  router.get("/sessions/:sessionId/stream", (req, res) => {
    const { sessionId } = req.params;
    streamEvents(
      req,
      res,
      (listener) =>
        handoff.subscribeSession(sessionId, (event) => {
          if (event.type === "message" && !isLiveForCustomer(event)) return;
          listener(event);
        }),
      () => ({
        event: "state",
        data: { escalation: handoff.activeEscalation(sessionId) ?? null },
      }),
    );
  });

  return router;
}
