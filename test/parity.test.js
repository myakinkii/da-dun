// Parity tests: the JS pipeline must match the reference tools exactly.
//   *.txt -> CSV must equal perl/notate.pl output   (test/expected/NAME.csv)
//   CSV -> MIDI must equal fourmilab csvmidi output (test/expected/NAME.mid)
// Regenerate expectations with: npm run fixtures  (needs perl and csvmidi)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { notate, NotationError } from "../src/notate.js";
import { csvToMidi } from "../src/csvmidi.js";

const root = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, root));
const list = dir => readdirSync(new URL(dir, root)).filter(f => f.endsWith(".txt")).map(f => [dir, f.slice(0, -4)]);

for (const [dir, name] of [...list("songs/"), ...list("test/cases/")]) {
  test(`${name}: notation -> CSV matches notate.pl`, () => {
    const { csv } = notate(read(`${dir}${name}.txt`).toString("utf8"));
    assert.equal(csv, read(`test/expected/${name}.csv`).toString("utf8"));
  });
  test(`${name}: CSV -> MIDI matches csvmidi`, () => {
    const { bytes, warnings } = csvToMidi(read(`test/expected/${name}.csv`).toString("utf8"));
    assert.deepEqual(warnings, []);
    assert.deepEqual(Buffer.from(bytes), read(`test/expected/${name}.mid`));
  });
}

test("all record types: CSV -> MIDI matches csvmidi", () => {
  const { bytes, warnings } = csvToMidi(read("test/csv/all-records.csv").toString("utf8"));
  assert.deepEqual(warnings, []);
  assert.deepEqual(Buffer.from(bytes), read("test/expected/all-records.mid"));
});

test("warnings point at the right lines", () => {
  const { warnings } = notate(read("test/cases/warnings.txt").toString("utf8"));
  assert.equal(warnings.length, 10);
  assert.deepEqual(warnings[0], { line: 2, message: "piano, bar 1 has 5 beats, expected 4" });
  assert.ok(warnings.every(w => w.line === 2 || w.line === 3));
});

test("unknown instruments stop conversion with a line number", () => {
  assert.throws(() => notate("tempo 100\nkazoo: c d e"),
    e => e instanceof NotationError && e.line === 2 && /kazoo/.test(e.message));
});

test("sharps are notes, not comments", () => {
  const { csv } = notate("piano: c# d eb # this is a comment");
  const notes = csv.split("\n").filter(l => l.includes("Note_on_c")).map(l => Number(l.split(", ")[4]));
  assert.deepEqual(notes, [61, 62, 63]);
});
