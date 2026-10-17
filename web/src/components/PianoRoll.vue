<script setup>
// Piano roll drawn from our own Song data. Click a note to play from it,
// click anywhere else to move the playhead there.
import { computed } from "vue";
import { GM_DRUMS, GM_DRUM_FIRST } from "@da-dun/core";

const props = defineProps({ song: Object, position: Number, playing: Boolean });
const emit = defineEmits(["seek", "play-note"]);
const W = 1000, H = 260;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);

const layout = computed(() => {
  const s = props.song;
  if (!s || !s.notes.length) return null;
  const dur = Math.max(s.duration, 0.5);
  const mel = s.notes.filter(n => n.ch !== 9);
  const drumKeys = [...new Set(s.notes.filter(n => n.ch === 9).map(n => n.note))].sort((a, b) => b - a);
  let lo = 127, hi = 0;
  for (const n of mel) { lo = Math.min(lo, n.note); hi = Math.max(hi, n.note); }
  if (mel.length) { lo -= 2; hi += 2; if (hi - lo < 12) { const c = (hi + lo) >> 1; lo = c - 6; hi = c + 6; } }
  const drumH = drumKeys.length ? (mel.length ? Math.min(Math.max(drumKeys.length * 14, 36), H * 0.35) : H) : 0;
  const melH = H - drumH, rowH = mel.length ? melH / (hi - lo + 1) : 0, drumRow = drumKeys.length ? drumH / drumKeys.length : 0;
  const x = t => (t / dur) * W;
  const rects = s.notes.map((n, i) => {
    const drum = n.ch === 9;
    const y = drum ? melH + drumKeys.indexOf(n.note) * drumRow + 1 : melH - (n.note - lo + 1) * rowH;
    const h = drum ? Math.max(2, drumRow - 2) : Math.max(2, rowH - 1);
    return { i, n, x: x(n.start), w: Math.max(2, x(n.end) - x(n.start)), y, h,
             color: drum ? "var(--drum)" : `var(--c${n.ch % 8})`, opacity: 0.45 + 0.5 * (n.vel / 127),
             label: `${drum ? (GM_DRUMS[n.note - GM_DRUM_FIRST] || "Drum") : noteName(n.note)}, bar ${n.bar} beat ${n.beat}. Click to play from here.` };
  });
  const beatTicks = s.barTicks / s.timeSig[0], lines = [], bars = [];
  for (let t = 0, b = 0; s.tickToSec(t) <= dur + 1e-6; t += beatTicks, b++) {
    const bar = b % s.timeSig[0] === 0, sec = s.tickToSec(t);
    lines.push({ x: x(sec), bar });
    if (bar) bars.push({ left: (sec / dur) * 100, n: b / s.timeSig[0] + 1 });
  }
  const octaves = [];
  if (mel.length) for (let k = lo; k <= hi; k++) if (k % 12 === 0) octaves.push({ y: melH - (k - lo) * rowH, name: noteName(k) });
  return { dur, rects, lines, bars, octaves, melH, divider: mel.length && drumKeys.length };
});
const playheadX = computed(() => (layout.value ? (props.position / layout.value.dur) * W : 0));
const isActive = n => props.playing && props.position >= n.start && props.position < n.end;
function onBackground(e) {
  if (!layout.value) return;
  const r = e.currentTarget.getBoundingClientRect();
  emit("seek", Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * layout.value.dur);
}
</script>

<template>
  <div class="roll">
    <div class="bars" aria-hidden="true">
      <span v-for="b in layout?.bars || []" :key="b.n" :style="{ left: b.left + '%' }">{{ b.n }}</span>
    </div>
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="group"
         aria-label="Piano roll. Click a note to play from it, or click anywhere to move the playhead." @click="onBackground">
      <template v-if="layout">
        <line v-for="(l, i) in layout.lines" :key="'g' + i" :x1="l.x" :x2="l.x" y1="0" :y2="H"
              :stroke="l.bar ? 'var(--grid-strong)' : 'var(--grid)'" vector-effect="non-scaling-stroke" />
        <line v-for="o in layout.octaves" :key="o.name" x1="0" :x2="W" :y1="o.y" :y2="o.y"
              stroke="var(--grid)" vector-effect="non-scaling-stroke" />
        <line v-if="layout.divider" x1="0" :x2="W" :y1="layout.melH" :y2="layout.melH"
              stroke="var(--grid-strong)" vector-effect="non-scaling-stroke" />
        <rect v-for="r in layout.rects" :key="r.i" class="note" :class="{ active: isActive(r.n) }"
              :x="r.x" :y="r.y" :width="r.w" :height="r.h" :fill="r.color" :fill-opacity="isActive(r.n) ? 1 : r.opacity"
              @click.stop="emit('play-note', r.n)"><title>{{ r.label }}</title></rect>
        <line :x1="playheadX" :x2="playheadX" y1="0" :y2="H" stroke="var(--playhead)" stroke-width="2"
              vector-effect="non-scaling-stroke" pointer-events="none" />
      </template>
    </svg>
    <p v-if="!layout" class="empty">No notes to show yet.</p>
  </div>
</template>

<style scoped>
.roll { position: relative; background: var(--roll); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.bars { position: relative; height: 18px; border-bottom: 1px solid var(--grid); font-size: 0.72rem; color: var(--muted); }
.bars span { position: absolute; top: 1px; transform: translateX(3px); }
svg { display: block; width: 100%; height: 260px; cursor: crosshair; }
.note { cursor: pointer; }
.note:hover { stroke: var(--ink); stroke-width: 1px; vector-effect: non-scaling-stroke; }
.note.active { stroke: var(--playhead); stroke-width: 2px; vector-effect: non-scaling-stroke; }
.empty { position: absolute; inset: 18px 0 0; display: grid; place-items: center; margin: 0; color: var(--muted); }
@media (max-width: 600px) { svg { height: 200px; } }
</style>
