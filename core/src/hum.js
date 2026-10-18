// hum.js: turn "da-da-DUN"-style descriptions into notation with an LLM.
// Model-agnostic: you pass an `ask(prompt)` function that sends a prompt to
// some model and resolves with its reply, as text or already parsed as JSON. The page uses the
// claude.ai artifact `sample` capability; a service could use any LLM API.
// Every answer is checked with notate(); problems go back for a repair round.

import { notate } from "./notate.js";

const RULES = `You are the co-writer in "da-dun", a tool where people sketch music by
humming it in words ("ta-ta-ta-TAAM, rising, heroic") and you turn that into
a tiny text notation. The person usually can't read music, so you make the
musical decisions they can't put into words, and explain them simply.

Reading da-duns:
- each syllable is usually one note; "da-da-da" in quick succession are
  short notes, "daaam" / "taaam" / a word at the end of a phrase is longer
- CAPITALS mean an accent (write >note) and often a longer or higher note
- "triplets", "rolling", "ta-ta-ta in one beat" mean 8t notes
- pitch words: rising/climbing/up, falling/down, same note, jump, low, high
- mood words (heroic, sad, playful, epic) guide intervals, harmony and register
- stay in the key and style of the existing sketch unless asked otherwise

Rules for your answer:
- change only what the request asks for; keep every other line, comment,
  title, tempo and time signature exactly as it is
- every bar must add up to the time signature; use R or rests to fill
- prefer continuing existing parts; to add bars to a part, extend its line
  or add another line with the same part name (it continues the part)
- when the request involves chords or a progression and the sketch has no key
  line, add one (like "key A" or "key F# minor"): the editor uses it to number
  the chords. Write chords as [c e g] in their own part, one chord per bar or beat
- new instruments go on their own line; drums use the step-grid syntax
- reply with ONLY a JSON object, no other text:
  {"notation": "<the complete updated sketch>", "explanation": "<one to three plain sentences: what you wrote and the musical choices you made, without jargon>"}`;

/**
 * Build the prompt for one request.
 * @param {{notation: string, request: string, guide: string, previous?: string, problems?: string[]}} p
 */
export function humPrompt({ notation, request, guide, previous, problems }) {
  let s = `${RULES}\n\n=== NOTATION GUIDE ===\n${guide.trim()}\n\n=== CURRENT SKETCH ===\n${notation.trim() || "(empty)"}\n\n=== REQUEST ===\n${request.trim()}\n`;
  if (previous !== undefined) {
    s += `\n=== YOUR PREVIOUS ANSWER ===\n${previous.trim()}\n\n=== PROBLEMS THE CONVERTER FOUND IN IT ===\n${problems.map(x => "- " + x).join("\n")}\n\nFix these problems and answer again, same JSON format.\n`;
  }
  return s;
}

/**
 * Read a model's reply as JSON, tolerantly (the same rules as claude.ai's
 * sample.json): the whole reply; else the body of one Markdown code fence;
 * else the text from the first { or [ to the last } or ]. Throws if none parse.
 */
export function parseJsonReply(text) {
  const t = String(text).trim();
  const tries = [t];
  const fences = [...t.matchAll(/```[\w-]*\s*\n([\s\S]*?)\n?```/g)];
  if (fences.length === 1) tries.push(fences[0][1]);
  const a = t.search(/[{[]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const c of tries) { try { return JSON.parse(c); } catch (e) {} }
  const err = new Error("The answer wasn’t valid JSON.");
  err.code = "invalid_json"; err.text = t;
  throw err;
}

/** Validate a reply (parsed JSON, or raw text to parse). Throws when it doesn't have the right shape. */
export function parseHumReply(reply) {
  if (typeof reply === "string") reply = parseJsonReply(reply);
  if (!reply || typeof reply !== "object" || typeof reply.notation !== "string" || !reply.notation.trim()) {
    throw new Error("The answer didn’t contain any notation.");
  }
  return { notation: reply.notation.replace(/\r\n/g, "\n").replace(/\s*$/, "\n"),
           explanation: typeof reply.explanation === "string" ? reply.explanation.trim() : "" };
}

/** Problems the converter finds in a notation, as plain strings (empty = fine). */
export function checkNotation(text) {
  try {
    return notate(text).warnings.map(w => (w.line ? `line ${w.line}: ` : "") + w.message);
  } catch (e) {
    return [e.message];
  }
}

/**
 * Ask for notation, checking the answer and asking for repairs if needed.
 * @param {{notation: string, request: string, guide: string,
 *          ask: (prompt: string) => Promise<string | object>, repairs?: number}} p
 * @returns {Promise<{notation: string, explanation: string, problems: string[], attempts: number}>}
 *   `problems` is empty when the final answer converts cleanly.
 */
export async function hum({ notation, request, guide, ask, repairs = 1 }) {
  let prompt = humPrompt({ notation, request, guide });
  for (let attempt = 1; ; attempt++) {
    const out = parseHumReply(await ask(prompt));
    const problems = checkNotation(out.notation);
    if (!problems.length || attempt > repairs) return { ...out, problems, attempts: attempt };
    prompt = humPrompt({ notation, request, guide, previous: out.notation, problems });
  }
}
