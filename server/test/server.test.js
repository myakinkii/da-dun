// The HTTP API end to end, with a fake model.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";

const guide = readFileSync(new URL("../../docs/notation.txt", import.meta.url), "utf8");
const page = join(mkdtempSync(join(tmpdir(), "da-dun-")), "index.html");
writeFileSync(page, "<!doctype html><title>da-dun</title>");
const sketch = "title Test\ntempo 96\n\npiano: a4 R | e R |\n";
const prompts = [];
let reply = () => "```json\n" + JSON.stringify({ notation: sketch + "piano: r4 e8t f# g# >a2 |\n", explanation: "Rises to A." }) + "\n```";
let server, base;
before(async () => {
  server = createServer(createApp({ ask: async p => { prompts.push(p); return reply(p); }, llm: "fake", guide, staticFile: page }));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
const post = (path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" },
                                                    body: typeof body === "string" ? body : JSON.stringify(body) });

test("health and the editor page", async () => {
  assert.deepEqual(await (await fetch(base + "/api/health")).json(), { ok: true, hum: true, llm: "fake" });
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /da-dun/);
});

test("notate: CSV and warnings", async () => {
  const r = await (await post("/api/notate", { notation: "piano: c1 | d4 e f |" })).json();   // a short first bar would be a pickup
  assert.match(r.csv, /Note_on_c, 0, 60, 82/);
  assert.deepEqual(r.warnings, [{ line: 1, message: "piano, bar 2 has 3 beats, expected 4" }]);
  assert.equal(r.notes, 4);
});

test("notate: errors come back with a line number", async () => {
  const r = await post("/api/notate", { notation: "tempo 90\nkazoo: c" });
  assert.equal(r.status, 422);
  assert.deepEqual(await r.json(), { error: 'line 2: unknown instrument or drum "kazoo"', code: "notation_error", line: 2 });
});

test("midi: from notation or from CSV, same bytes as core", async () => {
  const expected = readFileSync(new URL("../../core/test/expected/our-piece.mid", import.meta.url));
  const notation = readFileSync(new URL("../../core/test/cases/our-piece.txt", import.meta.url), "utf8");
  const r1 = await post("/api/midi", { notation, filename: "Our piece" });
  assert.equal(r1.headers.get("content-type"), "audio/midi");
  assert.equal(r1.headers.get("content-disposition"), 'attachment; filename="Our-piece.mid"');
  assert.deepEqual(Buffer.from(await r1.arrayBuffer()), expected);
  const csv = readFileSync(new URL("../../core/test/expected/our-piece.csv", import.meta.url), "utf8");
  assert.deepEqual(Buffer.from(await (await post("/api/midi", { csv })).arrayBuffer()), expected);
});

test("hum: runs the model, parses fenced JSON, checks the result", async () => {
  prompts.length = 0;
  const r = await (await post("/api/hum", { notation: sketch, request: "ta-ta-ta-TAAM" })).json();
  assert.equal(r.explanation, "Rises to A.");
  assert.deepEqual(r.problems, []);
  assert.equal(r.attempts, 1);
  assert.ok(prompts[0].includes("ta-ta-ta-TAAM") && prompts[0].includes("NOTATION GUIDE"));
});

test("hum: model failures and bad input", async () => {
  reply = () => "I can't do JSON today";
  let r = await post("/api/hum", { notation: sketch, request: "x" });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).code, "invalid_json");
  reply = () => { throw new Error("overloaded"); };
  r = await post("/api/hum", { notation: sketch, request: "x" });
  assert.equal((await r.json()).error, "The model request failed: overloaded");
  assert.equal((await post("/api/hum", { notation: sketch })).status, 400);
  assert.equal((await post("/api/hum", "{not json")).status, 400);
  assert.equal((await post("/api/nope", {})).status, 404);
});

test("hum without an LLM configured", async () => {
  const s = createServer(createApp({ guide }));
  await new Promise(r => s.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${s.address().port}`;
  assert.equal((await (await fetch(url + "/api/health")).json()).hum, false);
  const r = await fetch(url + "/api/hum", { method: "POST", body: JSON.stringify({ notation: "", request: "x" }) });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, "no_llm");
  assert.equal((await fetch(url + "/")).status, 404);
  s.close();
});
