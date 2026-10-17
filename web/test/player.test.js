// The player with a fake Tone.js: what gets scheduled, and when.
import { test } from "node:test";
import assert from "node:assert/strict";
import { notate, csvToSong } from "@da-dun/core";

globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
const { createPlayer } = await import("../src/player.js");

function fakeTone() {
  const log = [];
  class Node { constructor() { this.volume = { value: 0 }; } connect() { return this; } toDestination() { return this; } dispose() {} }
  class Synth extends Node {
    triggerAttackRelease(...a) { log.push(["note", ...a]); }
    releaseAll() { log.push(["releaseAll"]); }
  }
  const transport = {
    seconds: 0, events: [],
    schedule(fn, at) { this.events.push({ fn, at }); }, scheduleOnce(fn, at) { this.events.push({ fn, at, end: true }); },
    start(when, offset) { this.seconds = offset; log.push(["start", offset]); },
    stop() { log.push(["stop"]); }, cancel() { this.events = []; },
    run() { for (const e of this.events.slice().sort((a, b) => a.at - b.at)) e.fn(e.at); },   // fire everything
  };
  return { log, transport, Tone: {
    start: async () => {}, getTransport: () => transport, getDraw: () => ({ schedule: fn => fn() }),
    Limiter: Node, Volume: Node, Filter: Node, PolySynth: Synth, MonoSynth: Synth, MembraneSynth: Synth, NoiseSynth: Synth,
    Frequency: n => ({ toFrequency: () => 440 * 2 ** ((n - 69) / 12) }),
  } };
}
const songOf = t => csvToSong(notate(t).csv);

test("plays every note, then stops at the end", async () => {
  const f = fakeTone(), p = createPlayer({ Tone: f.Tone, canPlay: true });
  p.load(songOf("tempo 120\npiano: c4 d e f |"));
  await p.play(0);
  assert.equal(p.state.playing, true);
  assert.equal(f.transport.events.filter(e => !e.end).length, 4);
  f.transport.run();
  const notes = f.log.filter(l => l[0] === "note");
  assert.deepEqual(notes.map(n => Math.round(n[1])), [262, 294, 330, 349]);   // C4 D4 E4 F4 in Hz
  assert.equal(p.state.playing, false);                                        // the end event stopped it
  assert.equal(p.state.position, 0);
});

test("starting mid-song skips past notes and shortens a held one", async () => {
  const f = fakeTone(), p = createPlayer({ Tone: f.Tone, canPlay: true });
  p.load(songOf("tempo 60\npiano: c1 | d4 e f g |"));    // c lasts ~4 s, d starts at 4 s
  await p.play(2);
  const ev = f.transport.events.filter(e => !e.end);
  assert.equal(ev.length, 5);                       // held C (from 2 s) + d e f g
  assert.equal(ev[0].at, 2);
  f.transport.run();
  const first = f.log.find(l => l[0] === "note");
  assert.ok(first[2] > 1.9 && first[2] < 2, "held C plays only its remaining ~1.97 s");
  assert.deepEqual(f.log.find(l => l[0] === "start"), ["start", 2]);
});

test("drum hits you jumped past are not replayed", async () => {
  const f = fakeTone(), p = createPlayer({ Tone: f.Tone, canPlay: true });
  p.load(songOf("tempo 120\nkick: |x...x...x...x...|"));   // a hit on every beat (0.5 s apart)
  await p.play(0.6);
  assert.equal(f.transport.events.filter(e => !e.end).length, 2);    // the hits at 1.0 s and 1.5 s
});

test("seek while playing restarts there; stop keeps the position", async () => {
  const f = fakeTone(), p = createPlayer({ Tone: f.Tone, canPlay: true });
  p.load(songOf("tempo 120\npiano: c4 d e f | g a b c |"));
  await p.play(0);
  p.seek(2.5);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(f.log.filter(l => l[0] === "start").map(l => l[1]), [0, 2.5]);
  f.transport.seconds = 3.1;
  p.stop();
  assert.equal(p.state.playing, false);
  assert.equal(p.state.position, 3.1);
});

test("no audio: play does nothing", async () => {
  const f = fakeTone(), p = createPlayer({ Tone: f.Tone, canPlay: false });
  p.load(songOf("piano: c"));
  await p.play(0);
  assert.equal(p.state.playing, false);
  assert.equal(f.log.length, 0);
});
