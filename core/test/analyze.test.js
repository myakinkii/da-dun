// The key header, and chord names with Roman numerals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notate, NotationError, csvToSong, analyzeChords, keyName } from "../src/index.js";

const song = text => csvToSong(notate(text).csv);
const chords = (text, key) => analyzeChords(song(text), key).map(c => `${c.name} ${c.roman}`);

test("key header: major, minor, flats, and the MIDI key signature", () => {
  const sig = t => notate(t + "\npiano: c").csv.split("\n").find(l => l.includes("Key_signature"));
  assert.equal(sig("key A"), '1, 0, Key_signature, 3, "major"');
  assert.equal(sig("key F# minor"), '1, 0, Key_signature, 3, "minor"');
  assert.equal(sig("key Bb major"), '1, 0, Key_signature, -2, "major"');
  assert.equal(sig("key bb"), '1, 0, Key_signature, -2, "major"');
  assert.equal(sig("key Am"), '1, 0, Key_signature, 0, "minor"');
  assert.equal(sig("key c minor"), '1, 0, Key_signature, -3, "minor"');
  assert.equal(sig("title x"), undefined);
  assert.equal(notate("key A\npiano: c").key, "A major");
  assert.equal(notate("piano: c").key, null);
});

test("key header: impossible keys stop conversion with a line number", () => {
  assert.throws(() => notate("tempo 100\nkey G# major\npiano: c"),
    e => e instanceof NotationError && e.line === 2 && /usable key/.test(e.message));
});

test("csvToSong reads the key", () => {
  assert.deepEqual(song("key Eb minor\npiano: c").key, { sf: -6, minor: true });
  assert.equal(song("piano: c").key, null);
  assert.equal(keyName(song("key F# minor\npiano: c").key), "F# minor");
  assert.equal(keyName(song("key Eb\npiano: c").key), "Eb major");
});

test("a progression in A major, with its borrowed chord and inversions", () => {
  const text = readFileSync(new URL("cases/key-and-chords.txt", import.meta.url), "utf8");
  assert.deepEqual(chords(text), ["A I", "F#m vi", "D IV", "E V", "F bVI", "E7 V7", "A/C# I6"]);
});

test("minor keys: numerals are against the natural minor scale", () => {
  assert.deepEqual(chords("key Am\npiano: [a c' e']1 | [d f a]1 | [e g# b]1 | [f a c']1 | [g b d']1 | [g# b d']1 |"),
    ["Am i", "Dm iv", "E V", "F VI", "G VII", "G#dim vii°"]);
});

test("chord kinds, from the notes alone", () => {
  assert.deepEqual(chords("piano: [c e g b]1 | [c e g bb]1 | [c eb g bb]1 | [c eb gb bb]1 | [c eb gb a]1 | [c f g]1 | [c d g]1 | [c g c']1 | [c e g# ]1 |").map(s => s.split(" ")[0]),
    ["Cmaj7", "C7", "Cm7", "Cm7b5", "Cdim7", "Csus4", "Csus2", "C5", "Caug"]);
  // same notes, the bass decides
  assert.deepEqual(chords("piano: [c e g a]1 | [a, c e g]1 |").map(s => s.split(" ")[0]), ["C6", "Am7"]);
});

test("without a key there are names but no numerals; flat keys spell with flats", () => {
  assert.deepEqual(chords("piano: [c# e a]1 |"), ["A/C# null"]);
  assert.deepEqual(chords("key F\npiano: [f a c']1 | [bb d' f']1 |"), ["F I", "Bb IV"]);
});

test("melody and single notes are not chords; drums are ignored; the fullest part wins", () => {
  assert.deepEqual(chords("piano: c d e f g a | g2 c' e'\nkick: |x...x...|"), []);
  assert.deepEqual(chords("key C\npiano: [c e g]1 |\npiano (left) o3: [c e g b]1 |\nbass o2: c,1 |").length, 1);
  assert.deepEqual(chords("key C\npiano: [c e g]1 |\nbass o2: c,1 |"), ["C I"]);
});
