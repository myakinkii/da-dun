// player.js: plays a Song (from @da-dun/core csvToSong) with Tone.js synths.
// Sounds are simple synthesized approximations of General MIDI families and
// a synthesized drum kit; good enough for sketching, and fully self-contained.

import { start, getTransport, getDraw, getContext, setContext, Context, Limiter, Volume, Filter,
         PolySynth, MonoSynth, MembraneSynth, NoiseSynth, Frequency } from "tone";

// Only the parts of Tone.js we use (keeps the bundle small); tests pass a fake.
const ToneModule = { start, getTransport, getDraw, getContext, setContext, Context, Limiter, Volume, Filter,
                     PolySynth, MonoSynth, MembraneSynth, NoiseSynth, Frequency };
import { reactive, shallowRef } from "vue";

// One preset per General MIDI family (program >> 3)
const FAMILY = [
  { osc: "triangle", a: 0.005, d: 0.9, s: 0.12, r: 0.4, cut: 5000, db: -8 },   // piano
  { osc: "sine",     a: 0.002, d: 0.6, s: 0,    r: 0.5, cut: 8000, db: -6 },   // chromatic percussion
  { osc: "square",   a: 0.01,  d: 0.1, s: 0.9,  r: 0.08, cut: 2600, db: -16 }, // organ
  { osc: "sawtooth", a: 0.004, d: 0.7, s: 0.15, r: 0.2, cut: 3200, db: -14 },  // guitar
  { osc: "triangle", a: 0.005, d: 0.5, s: 0.6,  r: 0.1, cut: 1400, db: -4 },   // bass
  { osc: "sawtooth", a: 0.12,  d: 0.3, s: 0.85, r: 0.4, cut: 2400, db: -16 },  // strings
  { osc: "sawtooth", a: 0.2,   d: 0.3, s: 0.85, r: 0.5, cut: 2200, db: -16 },  // ensemble
  { osc: "sawtooth", a: 0.04,  d: 0.2, s: 0.75, r: 0.15, cut: 2200, db: -14 }, // brass
  { osc: "square",   a: 0.03,  d: 0.2, s: 0.8,  r: 0.12, cut: 2000, db: -15 }, // reed
  { osc: "sine",     a: 0.05,  d: 0.2, s: 0.9,  r: 0.15, cut: 6000, db: -6 },  // pipe
  { osc: "square",   a: 0.005, d: 0.2, s: 0.8,  r: 0.12, cut: 4000, db: -16 }, // synth lead
  { osc: "sawtooth", a: 0.4,   d: 0.5, s: 0.8,  r: 0.9, cut: 1500, db: -16 },  // synth pad
  { osc: "triangle", a: 0.2,   d: 0.5, s: 0.7,  r: 0.9, cut: 3000, db: -10 },  // synth effects
  { osc: "sawtooth", a: 0.004, d: 0.4, s: 0.1,  r: 0.2, cut: 3500, db: -14 },  // ethnic
  { osc: "sine",     a: 0.002, d: 0.3, s: 0,    r: 0.2, cut: 8000, db: -6 },   // percussive
  { osc: "triangle", a: 0.1,   d: 0.4, s: 0.6,  r: 0.5, cut: 3000, db: -10 },  // sound effects
];

const TOMS = { 41: 55, 43: 65, 45: 75, 47: 87, 48: 100, 50: 115 };

function makeDrums(Tone, out) {
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6, envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 } }).connect(out);
  const tom = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 2, envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 } }).connect(out);
  const noise = (type, freq, decay, db) => {
    const f = new Tone.Filter(freq, type).connect(out);
    const n = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay, sustain: 0, release: 0.01 } }).connect(f);
    n.volume.value = db;
    return n;
  };
  const snare = noise("bandpass", 1900, 0.18, -6), clap = noise("bandpass", 1200, 0.14, -6);
  const hat = noise("highpass", 7500, 0.05, -14), openHat = noise("highpass", 7000, 0.35, -16);
  const cymbal = noise("highpass", 5000, 1.4, -16), ride = noise("highpass", 6500, 0.7, -18);
  const perc = noise("bandpass", 800, 0.1, -8);
  kick.volume.value = -2; tom.volume.value = -6;
  return {
    hit(note, time, vel) {
      if (note === 35 || note === 36) kick.triggerAttackRelease(48, 0.4, time, vel);
      else if (note === 38 || note === 40) snare.triggerAttackRelease(0.18, time, vel);
      else if (note === 39) clap.triggerAttackRelease(0.14, time, vel);
      else if (note === 37) perc.triggerAttackRelease(0.05, time, vel);
      else if (note === 42 || note === 44) hat.triggerAttackRelease(0.05, time, vel);
      else if (note === 46) openHat.triggerAttackRelease(0.35, time, vel);
      else if (TOMS[note]) tom.triggerAttackRelease(TOMS[note], 0.35, time, vel);
      else if (note === 49 || note === 52 || note === 55 || note === 57) cymbal.triggerAttackRelease(1.4, time, vel);
      else if (note === 51 || note === 53 || note === 59) ride.triggerAttackRelease(0.7, time, vel);
      else perc.triggerAttackRelease(0.1, time, vel);
    },
    dispose() { for (const x of [kick, tom, snare, clap, hat, openHat, cymbal, ride, perc]) x.dispose(); },
  };
}

/**
 * Create a player. `state` is reactive: {playing, position, duration, error};
 * `song` is a ref to the song currently loaded (what a piano roll should show).
 * play(from) starts at `from` seconds; seek(t) moves (and keeps playing if
 * it was); stop() pauses where it is; load(song) swaps the song.
 * `Tone` can be injected (tests use a fake one).
 */
export function createPlayer({ Tone = ToneModule, canPlay: forceCanPlay } = {}) {
  const state = reactive({ playing: false, position: 0, duration: 0, error: "" });
  const canPlay = forceCanPlay ?? (typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext));
  let song = null, out = null, voices = new Map(), drums = null, raf = 0;
  const songRef = shallowRef(null);

  function ensureOutput() {
    if (out) return;
    const limiter = new Tone.Limiter(-1).toDestination();
    out = new Tone.Volume(-4).connect(limiter);
  }
  function voiceFor(ch, prog) {
    const key = ch + ":" + prog;
    if (!voices.has(key)) {
      const p = FAMILY[(prog >> 3) & 15];
      const v = new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: p.osc },
        envelope: { attack: p.a, decay: p.d, sustain: p.s, release: p.r },
        filter: { type: "lowpass", rolloff: -12, Q: 0.5 },
        filterEnvelope: { attack: 0.001, decay: p.d, sustain: 0.6, release: p.r, baseFrequency: p.cut / 2, octaves: 1 },
      }).connect(out);
      v.maxPolyphony = 48;
      v.volume.value = p.db;
      voices.set(key, v);
    }
    return voices.get(key);
  }
  function tick() {
    state.position = Math.min(Tone.getTransport().seconds, state.duration);
    if (state.playing) raf = requestAnimationFrame(tick);
  }

  async function play(from = state.position) {
    if (!song || !song.notes.length || !canPlay) return;
    const started = Tone.start();          // must begin inside the click
    halt();
    // Browsers can keep audio suspended; don't wait forever for it.
    const ok = await Promise.race([started.then(() => true, () => false),
                                   new Promise(r => setTimeout(() => r(false), 1500))]);
    if (!ok || Tone.getContext().state !== "running") {
      state.error = "The browser hasn’t started audio. Click Play again, or Reset audio.";
      return;
    }
    state.error = "";
    ensureOutput();
    if (!drums && song.notes.some(n => n.ch === 9)) drums = makeDrums(Tone, out);
    if (from >= song.duration - 0.01) from = 0;
    const tr = Tone.getTransport();
    for (const n of song.notes) {
      if (n.end <= from + 0.001) continue;
      const at = Math.max(n.start, from);
      if (n.ch === 9) {
        if (n.start < from - 0.001) continue;          // don't replay drum hits we jumped into
        tr.schedule(time => drums.hit(n.note, time, n.vel / 127), at);
      } else {
        const v = voiceFor(n.ch, n.prog), freq = Tone.Frequency(n.note, "midi").toFrequency(), len = n.end - at;
        tr.schedule(time => v.triggerAttackRelease(freq, len, time, n.vel / 127), at);
      }
    }
    tr.scheduleOnce(time => Tone.getDraw().schedule(() => finish(), time), song.duration + 0.05);
    tr.start("+0.05", from);
    state.position = from;
    state.playing = true;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function halt() {
    const tr = Tone.getTransport();
    tr.stop(); tr.cancel(0);
    for (const v of voices.values()) v.releaseAll();
    cancelAnimationFrame(raf);
  }
  function stop() {
    if (!state.playing) return;
    const pos = Tone.getTransport().seconds;
    halt();
    state.playing = false;
    state.position = Math.min(pos, state.duration);
  }
  function finish() { halt(); state.playing = false; state.position = 0; }
  function seek(t) {
    t = Math.max(0, Math.min(t, state.duration));
    if (state.playing) play(t); else state.position = t;
  }
  function load(next) {
    const was = state.playing, at = state.position;
    if (was) { halt(); state.playing = false; }
    song = next;
    songRef.value = next;
    state.duration = next ? next.duration : 0;
    state.position = Math.min(at, state.duration);
    if (state.position >= state.duration) state.position = 0;
    if (was && next) play(state.position);
  }
  // Recreate the audio connection, like a page reload does. Fixes silence after
  // the output device changed (headphones, Bluetooth) or audio got stuck.
  function resetAudio() {
    if (state.playing) { halt(); state.playing = false; }
    for (const v of voices.values()) v.dispose();
    voices = new Map();
    if (drums) drums.dispose();
    drums = null;
    if (out) out.dispose();
    out = null;
    const old = Tone.getContext();
    Tone.setContext(new Tone.Context());
    try { old.dispose(); } catch (e) {}
    state.error = "";
    return play(state.position);           // called from a click, so audio may start right away
  }
  return { state, song: songRef, canPlay, play, stop, seek, load, resetAudio,
           toggle: () => (state.playing ? stop() : play()) };
}
