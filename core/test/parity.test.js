// Parity tests: the JS pipeline must match the reference tools exactly.
//   *.txt -> CSV must equal perl/notate.pl output   (test/expected/NAME.csv)
//   CSV -> MIDI must equal fourmilab csvmidi output (test/expected/NAME.mid)
// Regenerate expectations with: npm run fixtures  (needs perl and csvmidi)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { notate, NotationError } from "../src/notate.js";
import { csvToMidi } from "../src/csvmidi.js";

const root = new URL("../", import.meta.url);           // core/
const read = p => readFileSync(new URL(p, root));
const list = dir => readdirSync(new URL(dir, root)).filter(f => f.endsWith(".txt")).map(f => [dir, f.slice(0, -4)]);

for (const [dir, name] of [...list("../songs/"), ...list("test/cases/")]) {
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

test("zip: CRC-32 and a valid stored archive", async () => {
  const { crc32, makeZip } = await import("../src/zip.js");
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
  const mid = read("test/expected/01-our-piece.mid");
  const z = makeZip([{ name: "our-piece.mid", data: new Uint8Array(mid) }]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034B50);              // local file header
  assert.equal(dv.getUint32(14, true), crc32(mid));
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054B50);  // end of central directory
  assert.deepEqual(Buffer.from(z.subarray(30 + 13, 30 + 13 + mid.length)), mid);
});
