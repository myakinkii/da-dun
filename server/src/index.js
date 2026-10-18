#!/usr/bin/env node
// da-dun server: the HTTP API plus the built editor (dist/index.html).
//   PORT (8787)  HOST (127.0.0.1)  DA_DUN_CORS (unset = same origin only; "*" for any)
//   LLM settings: see askFromEnv in llm.js (ANTHROPIC_API_KEY is enough to start)

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { askFromEnv } from "./llm.js";

const root = new URL("../../", import.meta.url);
const port = Number(process.env.PORT || 8787), host = process.env.HOST || "127.0.0.1";
let llm = null;
try { llm = askFromEnv(); } catch (e) { console.error("LLM setup: " + e.message); process.exit(1); }

const app = createApp({
  ask: llm && llm.ask, llm: llm && llm.describe,
  guide: readFileSync(new URL("docs/notation.txt", root), "utf8"),
  staticFile: fileURLToPath(new URL("dist/index.html", root)),
  cors: process.env.DA_DUN_CORS,
});
createServer(app).listen(port, host, () => {
  console.log(`da-dun server on http://${host}:${port}`);
  console.log(llm ? `hum box: ${llm.describe}` : "hum box: off (set ANTHROPIC_API_KEY, or see server/README.md)");
});
