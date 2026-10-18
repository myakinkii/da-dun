<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useSketchbook, GUIDE } from "./sketchbook.js";
import PianoRoll from "./components/PianoRoll.vue";
import HumBox from "./components/HumBox.vue";

const sb = useSketchbook();
const { player, text, compiled, current, currentKey, menu, syncNote, banner, humState, zipMidi, previewing, listening } = sb;
const comparing = computed(() => humState.proposal && !humState.proposal.answerOnly);
const shownSong = player.song;   // what the player holds: the sketch, or a suggestion being previewed
const editorEl = ref(null);
const view = ref("csv");

const groups = computed(() => ["Examples", "My songs", "My sketches"]
  .map(g => ({ label: g, items: menu.value.filter(m => m.group === g) })).filter(g => g.items.length));
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };
const status = computed(() => {
  const c = compiled.value;
  if (!c.ok) return null;
  const w = c.warnings.length;
  return `${c.bars} bar${c.bars === 1 ? "" : "s"}, ${c.notes} note${c.notes === 1 ? "" : "s"}` +
         (w ? `, ${w} warning${w === 1 ? "" : "s"}:` : ". All good.");
});

function gotoLine(n) {
  const el = editorEl.value, lines = el.value.split("\n");
  const start = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
  el.focus();
  el.setSelectionRange(start, start + (lines[n - 1] || "").length);
  el.scrollTop = Math.max(0, (n - 3) * (parseFloat(getComputedStyle(el).lineHeight) || 20));
}
function playFromStart() { sb.compileNow(); player.play(0); }
// Clicking a note in the piano roll plays from it and, for your own sketch,
// puts the editor's cursor on the note's text.
function selectSource(src) {
  const el = editorEl.value, lines = el.value.split("\n");
  if (!src || src.line > lines.length) return;
  const start = lines.slice(0, src.line - 1).reduce((a, l) => a + l.length + 1, 0) + src.col;
  el.focus({ preventScroll: true });
  el.setSelectionRange(start, start + src.len);
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
  const top = (src.line - 1) * lh;
  if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - lh) el.scrollTop = Math.max(0, top - 2 * lh);
}
function onNote(n) {
  player.play(n.start);
  if (!previewing.value) selectSource(n.src);
}
function onEditorKey(e) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); playFromStart(); }
  else if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    const el = editorEl.value;
    el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
    sb.onInput(el.value);
  }
}
function onGlobalKey(e) {
  if (e.code === "Space" && !/^(INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY)$/.test(e.target.tagName)) {
    e.preventDefault(); player.toggle();
  }
}
onMounted(() => { sb.start(); window.addEventListener("keydown", onGlobalKey); });
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKey));
</script>

<template>
  <main>
    <div class="bar">
      <select :value="currentKey" aria-label="Song" @change="sb.open($event.target.value)">
        <optgroup v-for="g in groups" :key="g.label" :label="g.label">
          <option v-for="m in g.items" :key="m.key" :value="m.key">{{ m.title }}</option>
        </optgroup>
      </select>
      <button @click="sb.newSketch()">New sketch</button>
      <button v-if="current?.example" title="Back to the original example (you can undo)" @click="sb.revert()">Revert</button>
      <button v-if="current?.sketch" @click="sb.remove()">Delete</button>
    </div>

    <HumBox v-if="humState.available" :sb="sb" />

    <textarea ref="editorEl" class="editor" :value="text" spellcheck="false" autocapitalize="off" autocomplete="off"
              aria-label="Notation" @input="sb.onInput($event.target.value)" @keydown="onEditorKey"></textarea>
    <p class="hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> plays from the start, <kbd>Space</kbd> plays and stops. {{ syncNote }}</p>

    <div v-if="banner" class="banner" role="status">
      <span>{{ banner.text }}</span>
      <button v-for="a in banner.actions" :key="a.label" @click="sb.bannerAction(a)">{{ a.label }}</button>
    </div>

    <div class="status" aria-live="polite">
      <template v-if="compiled.ok">
        <span class="ok">{{ status }}</span>
        <ul v-if="compiled.warnings.length">
          <li v-for="(w, i) in compiled.warnings" :key="i">
            <button class="warn" @click="w.line && gotoLine(w.line)">{{ w.line ? `Line ${w.line}: ` : "" }}{{ w.message }}</button>
          </li>
        </ul>
      </template>
      <template v-else>
        <div class="err">{{ compiled.error }}</div>
        <ul v-if="compiled.line"><li><button class="warn" @click="gotoLine(compiled.line)">Go to line {{ compiled.line }}</button></li></ul>
      </template>
    </div>

    <div class="transport">
      <button class="play" :aria-label="player.state.playing ? 'Stop' : 'Play'" :disabled="!player.canPlay || !compiled.ok"
              @click="player.toggle()">
        <svg v-if="!player.state.playing" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>
        <svg v-else viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"/></svg>
      </button>
      <button @click="playFromStart" :disabled="!player.canPlay || !compiled.ok">From the start</button>
      <span class="time">{{ fmt(player.state.position) }} <span>/ {{ fmt(player.state.duration) }}</span></span>
      <span v-if="compiled.ok && compiled.song" class="bpm">{{ Math.round(compiled.song.bpm) }} BPM</span>
      <span v-if="!player.canPlay" class="err">This browser can’t play audio.</span>
      <span v-if="player.state.error" class="err">{{ player.state.error }}</span>
      <button v-if="player.canPlay" class="reset" title="Recreates the page’s audio connection, like reloading the page"
              @click="player.resetAudio()">No sound? Reset audio</button>
    </div>
    <div v-if="comparing" class="ab" role="group" aria-label="Which version to play">
      <button :aria-pressed="listening === 'mine'" @click="sb.listen('mine')">Your version</button>
      <button :aria-pressed="listening === 'claude'" @click="sb.listen('claude')">Claude’s suggestion</button>
      <span>{{ previewing ? "Not in your sketch until you choose Use this." : "Switch while playing to compare the same moment." }}</span>
    </div>
    <PianoRoll :song="shownSong" :position="player.state.position" :playing="player.state.playing"
               @seek="player.seek" @play-note="onNote" />

    <div class="tabs" role="tablist">
      <button role="tab" :aria-selected="view === 'csv'" @click="view = 'csv'">CSV</button>
      <button role="tab" :aria-selected="view === 'guide'" @click="view = 'guide'">Notation guide</button>
    </div>
    <pre>{{ view === "guide" ? GUIDE : (compiled.ok ? compiled.csv : "") }}</pre>
    <div class="bar save">
      <span class="hint">Save as:</span>
      <button @click="sb.saveFile('mid')">{{ zipMidi ? "MIDI (zip)" : "MIDI" }}</button>
      <button @click="sb.saveFile('csv')">CSV</button>
      <button @click="sb.saveFile('txt')">Notation</button>
    </div>
  </main>
</template>

<style scoped>
.transport { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 6px 0 10px; }
.play { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; padding: 0;
        background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.play svg { width: 16px; height: 16px; }
.time { font-variant-numeric: tabular-nums; font-weight: 500; }
.time span, .bpm { color: var(--muted); font-weight: 400; }
.banner { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0 0; padding: 8px 12px;
          border: 1px solid var(--accent); border-radius: 8px; background: var(--panel); font-size: 0.9rem; }
.banner span { flex: 1; min-width: 12em; }
.reset { margin-left: auto; border: 0; background: none; padding: 0; color: var(--muted); font-size: 0.85rem; cursor: pointer; }
.reset:hover { color: var(--ink); text-decoration: underline; }
.ab { display: flex; flex-wrap: wrap; align-items: center; gap: 0; margin: 0 0 8px; }
.ab button { border-radius: 0; font-size: 0.9rem; }
.ab button:first-child { border-radius: 6px 0 0 6px; }
.ab button:nth-child(2) { border-radius: 0 6px 6px 0; border-left: 0; }
.ab button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.ab span { margin-left: 10px; font-size: 0.85rem; color: var(--muted); }
.save { margin-top: 10px; }
.save .hint { margin: 0; }
.warn { border: 0; background: none; padding: 1px 0; color: var(--warn); text-align: left; cursor: pointer; font: inherit; }
.warn:hover { text-decoration: underline; }
</style>
