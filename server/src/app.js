// app.js: the HTTP API as a plain Node request handler (no framework).
//
//   GET  /                the editor (dist/index.html), if it has been built
//   GET  /api/health      {ok, hum, llm}
//   POST /api/notate      {notation}            -> {csv, warnings, title, bars, notes}
//   POST /api/midi        {notation} | {csv}    -> audio/midi file
//   POST /api/hum         {notation, request}   -> {notation, explanation, problems, attempts}
//
// Errors are JSON: {error, code, line?} with a 4xx/5xx status.

import { readFile } from "node:fs/promises";
import { notate, csvToMidi, hum, NotationError } from "@da-dun/core";

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extra });
  res.end(JSON.stringify(body));
};
class HttpError extends Error {
  constructor(status, code, message, more = {}) { super(message); this.status = status; this.code = code; this.more = more; }
}

async function readJson(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, "too_large", `Request body is over ${limit} bytes.`);
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch (e) { throw new HttpError(400, "bad_json", "Request body must be JSON."); }
}
const str = (body, key, required = true) => {
  const v = body[key];
  if (v === undefined && !required) return undefined;
  if (typeof v !== "string") throw new HttpError(400, "bad_request", `"${key}" must be a string.`);
  return v;
};
function convert(notation) {
  try { return notate(notation); }
  catch (e) {
    if (e instanceof NotationError) throw new HttpError(422, "notation_error", e.message, { line: e.line ?? null });
    throw e;
  }
}

/**
 * @param {{ask?: Function | null, llm?: string, guide: string, staticFile?: string,
 *          cors?: string, limit?: number}} opts
 */
export function createApp({ ask = null, llm = null, guide, staticFile, cors, limit = 1_000_000 }) {
  return async function handle(req, res) {
    const corsHeaders = cors ? { "access-control-allow-origin": cors, "access-control-allow-headers": "content-type" } : {};
    try {
      const { pathname } = new URL(req.url, "http://x");
      if (req.method === "OPTIONS" && cors) { res.writeHead(204, { ...corsHeaders, "access-control-allow-methods": "GET, POST" }); return res.end(); }

      if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        const html = staticFile && await readFile(staticFile).catch(() => null);
        if (!html) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("The editor isn't built yet: run npm run build, then restart.\n"); }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(html);
      }
      if (req.method === "GET" && pathname === "/api/health") return json(res, 200, { ok: true, hum: !!ask, llm }, corsHeaders);

      if (req.method !== "POST" || !pathname.startsWith("/api/")) throw new HttpError(404, "not_found", "No such endpoint.");
      const body = await readJson(req, limit);

      if (pathname === "/api/notate") {
        const r = convert(str(body, "notation"));
        return json(res, 200, { csv: r.csv, warnings: r.warnings, title: r.title,
                                bars: Math.ceil(r.ticks / r.barTicks), notes: r.notes }, corsHeaders);
      }
      if (pathname === "/api/midi") {
        const csv = body.csv !== undefined ? str(body, "csv") : convert(str(body, "notation")).csv;
        let m;
        try { m = csvToMidi(csv); } catch (e) { throw new HttpError(422, "csv_error", e.message); }
        const name = (String(body.filename || "sketch").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "sketch") + ".mid";
        res.writeHead(200, { "content-type": "audio/midi", "content-disposition": `attachment; filename="${name}"`,
                             "x-da-dun-warnings": String(m.warnings.length), ...corsHeaders });
        return res.end(Buffer.from(m.bytes));
      }
      if (pathname === "/api/hum") {
        if (!ask) throw new HttpError(503, "no_llm", "This server has no LLM configured. Set ANTHROPIC_API_KEY (or see the server README).");
        const notation = str(body, "notation"), request = str(body, "request").trim();
        if (!request) throw new HttpError(400, "bad_request", "\"request\" is empty.");
        const ctl = new AbortController();
        res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
        try {
          const r = await hum({ notation, request, guide, repairs: 1, ask: p => ask(p, { signal: ctl.signal }) });
          return json(res, 200, r, corsHeaders);
        } catch (e) {
          if (ctl.signal.aborted) return;
          if (e.code === "invalid_json") throw new HttpError(502, "invalid_json", "The model’s answer couldn’t be read. Try again.");
          throw new HttpError(502, "llm_error", `The model request failed: ${e.message}`);
        }
      }
      throw new HttpError(404, "not_found", "No such endpoint.");
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return json(res, e.status, { error: e.message, code: e.code, ...e.more }, corsHeaders);
      console.error(e);
      return json(res, 500, { error: "Internal error.", code: "internal" }, corsHeaders);
    }
  };
}
