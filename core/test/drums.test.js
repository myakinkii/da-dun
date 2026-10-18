// Drum lines: a step grid when it fits, otherwise rhythm notation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { notate, csvToSong } from "../src/index.js";

const hits = text => csvToSong(notate(text).csv).notes.map(n => `${n.startTick}${n.vel > 100 ? "!" : ""}`);
const warns = text => notate(text).warnings.map(w => w.message);

test("a grid that fits stays a grid", () => {
  assert.deepEqual(hits("kick: |x...x...x...x...|"), ["0", "480", "960", "1440"]);
  assert.deepEqual(hits("kick: |X.......X.......|"), ["0!", "960!"]);
});

test("lines that don't fit a grid but read as notes are notes", () => {
  assert.deepEqual(hits("kick: x r x r |"), ["0", "960"]);
  assert.deepEqual(hits("snare: x x x x |"), ["0", "480", "960", "1440"]);           // quarters, not 16ths
  assert.deepEqual(hits("hat: x8t x x X x x >x2 |"), ["0", "160", "320", "480!", "640", "800", "960!"]);
  assert.deepEqual(warns("snare: x x x x |"), []);
});

test("when neither fits, the grid's problems are reported", () => {
  assert.deepEqual(warns("kick: |x...x...x...x..|"), ['kick: bar "x...x...x...x.." has 15 steps, expected 16']);
  const w = warns("snare: x4 x x x x |");               // 5 beats in 4/4: wrong as notes too
  assert.ok(w.some(m => /steps, expected 16/.test(m)), w.join("; "));
});

test("modes are per line; note-mode durations carry over between note lines", () => {
  const t = "ride: |x.x.x.x.x.x.x.x.|\nride: x4t x8t x2. |\nride: x4 x x x |";
  assert.deepEqual(hits(t), ["0", "240", "480", "720", "960", "1200", "1440", "1680",
                             "1920", "2240", "2400", "3840", "4320", "4800", "5280"]);
  // durations carry over: after x2. a plain x is a dotted half, so this bar doesn't fit as notes
  assert.match(warns("ride: x4t x8t x2. |\nride: x x x x |")[0], /has 4 steps, expected 16/);
});

test("R, @ and swing in 5/4", () => {
  assert.deepEqual(hits("time 5/4\nride: x4 x4t x8t x4 x4 x4t x8t | @3 x2. R |"),
    ["0", "480", "800", "960", "1440", "1920", "2240", "4800"]);
});

test("note-mode hits point at their token", () => {
  const text = "hat: x8 >x X x x2 |", r = notate(text);
  const toks = csvToSong(r.csv).notes.map(n => { const s = r.sources[`${n.track}:${n.startTick}:${n.note}`]; return text.slice(s.col, s.col + s.len); });
  assert.deepEqual(toks, ["x8", ">x", "X", "x", "x2"]);
});
