// hum.js with a fake model: prompt contents, validation, and the repair round.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hum, humPrompt, parseHumReply, checkNotation } from "../src/hum.js";

const guide = readFileSync(new URL("../../docs/notation.txt", import.meta.url), "utf8");
const sketch = "title Test\ntempo 96\n\npiano: a'4 R | e R |\n";

test("prompt carries rules, guide, sketch and request", () => {
  const p = humPrompt({ notation: sketch, request: "ta-ta-TAAM rising", guide });
  for (const part of ["Reading da-duns", "NOTATION GUIDE", "piano: a'4 R | e R |", "ta-ta-TAAM rising", '"notation"'])
    assert.ok(p.includes(part), part);
});

test("a clean answer is returned after one call", async () => {
  const calls = [];
  const r = await hum({ notation: sketch, request: "x", guide, ask: async p => {
    calls.push(p);
    return { notation: sketch.replace("e R |", "e R | r4 e8t f# g# >a2 |"), explanation: "Rises to A." };
  } });
  assert.equal(calls.length, 1);
  assert.equal(r.attempts, 1);
  assert.deepEqual(r.problems, []);
  assert.equal(r.explanation, "Rises to A.");
});

test("converter problems go back to the model once", async () => {
  const calls = [];
  const answers = [
    { notation: "title Test\npiano: a'4 R | e R | c d e |", explanation: "first" },   // bar 3 too short
    { notation: "title Test\npiano: a'4 R | e R | c d e f |", explanation: "fixed" },
  ];
  const r = await hum({ notation: sketch, request: "x", guide, ask: async p => { calls.push(p); return answers[calls.length - 1]; } });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes("PROBLEMS THE CONVERTER FOUND") && calls[1].includes("bar 3 has 3 beats"));
  assert.equal(r.explanation, "fixed");
  assert.deepEqual(r.problems, []);
});

test("gives up after the repair budget and reports what's left", async () => {
  const r = await hum({ notation: sketch, request: "x", guide, repairs: 1,
    ask: async () => ({ notation: "kazoo: c", explanation: "" }) });
  assert.equal(r.attempts, 2);
  assert.match(r.problems[0], /kazoo/);
});

test("replies without notation are rejected", () => {
  assert.throws(() => parseHumReply({ explanation: "no notes" }));
  assert.throws(() => parseHumReply("just text"));
  assert.equal(parseHumReply({ notation: "piano: c\r\n" }).notation, "piano: c\n");
  assert.deepEqual(checkNotation("piano: c d e f |"), []);
});
