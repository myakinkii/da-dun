// notate().sources: from a note to where it's written, for click-to-text in the editor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { notate, csvToSong } from "../src/index.js";

function located(text) {
  const r = notate(text), lines = text.split("\n");
  return csvToSong(r.csv).notes.map(n => {
    const s = r.sources[`${n.track}:${n.startTick}:${n.note}`];
    return s && lines[s.line - 1].slice(s.col, s.col + s.len);
  });
}

test("each note points at its own token", () => {
  const text = "title t\n  piano:  c4 d|e8t f# g  >a2 # comment\npiano: @3 b1 |";
  assert.deepEqual(located(text), ["c4", "d", "e8t", "f#", "g", ">a2", "b1"]);
});

test("chords, accented chords and ties point at the chord token that started them", () => {
  const text = "piano: [c e g]2 >[d f a]2~ | [d f a]1 |";
  assert.deepEqual(located(text), ["[c e g]2", "[c e g]2", "[c e g]2", ">[d f a]2~", ">[d f a]2~", ">[d f a]2~"]);
});

test("drum hits point at their x", () => {
  const text = "kick: |x... x...| @3 |X...............|";
  const r = notate(text);
  const cols = csvToSong(r.csv).notes.map(n => r.sources[`${n.track}:${n.startTick}:${n.note}`].col);
  assert.deepEqual(cols, [7, 12, 22]);
  assert.deepEqual(cols.map(c => text[c]), ["x", "x", "X"]);
});
