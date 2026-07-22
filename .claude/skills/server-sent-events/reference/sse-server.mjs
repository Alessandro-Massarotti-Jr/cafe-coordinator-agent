// Standalone Express entry for the SSE reference. Thin on purpose: all the
// interesting code lives in ./sse.mjs (framing) and is framework-agnostic.
//
// Run:  cd backend && node ../.claude/skills/server-sent-events/reference/sse-server.mjs
// (run from `backend/` so Node resolves `express` from backend/node_modules)

import express from "express";
import { mountSseRoutes } from "./sse.mjs";

const app = express();
app.use(express.json());
mountSseRoutes(app);

const PORT = Number(process.env.PORT ?? 3100);
app.listen(PORT, () => console.log(`SSE reference server on ${PORT}`));
