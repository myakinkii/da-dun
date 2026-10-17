<script setup>
// "Hum it to Claude": describe music in words, Claude writes the notation.
import { ref } from "vue";

const props = defineProps({ sb: Object });
const request = ref("");
const st = props.sb.humState;
async function go() {
  if (!request.value.trim()) return;
  await props.sb.humAsk(request.value);
}
function onKey(e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } }
const LABEL = { open: "new", used: "used", dropped: "dropped", answer: "answer" };
const short = s => (s.length > 90 ? s.slice(0, 88) + "…" : s);
</script>

<template>
  <section class="hum" aria-labelledby="hum-label">
    <label id="hum-label" for="hum-input">Hum it to Claude</label>
    <div class="row">
      <textarea id="hum-input" v-model="request" rows="2" @keydown="onKey"
                placeholder="ta-ta-ta-TAAM, rising and heroic. Add it as two new bars after bar 4."></textarea>
      <div class="buttons">
        <button class="primary" :disabled="st.busy" @click="go">Write it</button>
        <button v-if="st.busy" @click="sb.humStop()">Stop</button>
      </div>
    </div>
    <p class="note" aria-live="polite">{{ st.note }}</p>
    <div v-if="st.proposal" class="result">
      <p>{{ st.proposal.explanation || "Here’s a version." }}</p>
      <template v-if="!st.proposal.answerOnly">
        <pre>{{ st.proposal.notation }}</pre>
        <div class="actions">
          <button class="primary" @click="sb.humUse()">Use this</button>
          <button @click="sb.humPreview()">Play it</button>
          <button @click="sb.humDiscard()">Discard</button>
        </div>
      </template>
      <div v-else class="actions"><button @click="sb.humDiscard()">Close</button></div>
    </div>
    <details v-if="sb.humHistory.value.length" class="history">
      <summary>Earlier answers ({{ sb.humHistory.value.length }})</summary>
      <ol>
        <li v-for="it in sb.humHistory.value" :key="it.id">
          <button class="link" @click="sb.showProposal(it)">{{ short(it.request) }}</button>
          <span>{{ LABEL[it.status] || "" }}</span>
        </li>
      </ol>
      <button @click="sb.humForget()">Forget these</button>
    </details>
  </section>
</template>

<style scoped>
.hum { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
label { display: block; font-weight: 600; margin-bottom: 6px; }
.row { display: flex; gap: 8px; align-items: flex-start; }
.row textarea { flex: 1; min-height: 0; white-space: pre-wrap; font: inherit; padding: 8px 10px; resize: vertical; }
.buttons { display: flex; flex-direction: column; gap: 6px; }
.note { margin: 6px 0 0; color: var(--muted); font-size: 0.9rem; min-height: 1.2em; }
.result p { margin: 8px 0; }
.result pre { max-height: 220px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.history { margin-top: 8px; font-size: 0.9rem; }
.history summary { cursor: pointer; color: var(--muted); }
.history ol { margin: 6px 0 8px; padding-left: 1.4em; }
.history li { margin: 2px 0; }
.history li span { color: var(--muted); font-size: 0.8rem; margin-left: 4px; }
.link { border: 0; background: none; padding: 0; color: var(--accent); text-align: left; cursor: pointer; }
.link:hover { text-decoration: underline; }
@media (max-width: 560px) { .row { flex-direction: column; align-items: stretch; } .buttons { flex-direction: row; } }
</style>
