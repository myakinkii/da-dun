// csvToSong: timing, bars, programs and tempo changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notate, csvToSong } from "../src/index.js";

const song = text => csvToSong(notate(text).csv);

test("timing at 96 BPM, bars and beats", () => {
  const s = song("title Our piece\ntempo 96\ntime 4/4\n\npiano: a4 R | e R | r4 e8t f# g# a4 b8t c#' b | a8 g# a2. |");
  assert.equal(s.title, "Our piece");
  assert.equal(s.notes.length, 12);
  assert.equal(Math.round(s.bpm), 96);
  const [a, e] = s.notes;
  assert.deepEqual([a.note, a.start, a.bar, a.beat], [69, 0, 1, 1]);
  assert.deepEqual([e.note, e.start, e.bar, e.beat], [64, 2.5, 2, 1]);   // a 4/4 bar at 96 BPM lasts 2.5 s
  assert.equal(s.notes[0].prog, 0);
  assert.ok(Math.abs(s.duration - 9.96) < 0.01, String(s.duration));
});

test("drums are on channel 9 and programs follow the part", () => {
  const s = csvToSong(readFileSync(new URL("expected/rock-groove.csv", import.meta.url), "utf8"));
  assert.ok(s.notes.some(n => n.ch === 9 && n.note === 36));
  assert.ok(s.notes.filter(n => n.ch !== 9).every(n => n.prog === 33));
});

test("tempo changes are applied", () => {
  const csv = `0, 0, Header, 1, 1, 480
1, 0, Start_track
1, 0, Tempo, 500000
1, 960, Tempo, 1000000
1, 0, Note_on_c, 0, 60, 90
1, 480, Note_off_c, 0, 60, 0
1, 1440, Note_on_c, 0, 62, 90
1, 1920, Note_off_c, 0, 62, 0
1, 1920, End_track
0, 0, End_of_file`.split("\n").sort((a, b) => Number(a.split(",")[1]) - Number(b.split(",")[1])).join("\n");
  const s = csvToSong(csv);
  assert.equal(s.notes[0].start, 0);
  assert.equal(s.notes[1].start, 2);   // 2 beats at 120 BPM (1 s), then 1 beat at 60 BPM (1 s)
  assert.equal(s.notes[1].end, 3);
});

test("tied notes are one long note; chords are simultaneous", () => {
  const s = song("piano: c2~ c2 | [c e g]1 |");
  assert.equal(s.notes.length, 4);
  assert.equal(s.notes[0].endTick, 1920 - 30);   // held through both halves, minus the articulation gap
  assert.deepEqual(s.notes.slice(1).map(n => [n.note, n.start, n.bar]), [[60, 2, 2], [64, 2, 2], [67, 2, 2]]);
});
