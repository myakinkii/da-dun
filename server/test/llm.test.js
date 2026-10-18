// The two API dialects, against a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeAsk, askFromEnv, LlmError } from "../src/llm.js";

function fakeFetch(respond) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const { status = 200, body } = respond(url);
    return { ok: status < 400, status, statusText: "err", json: async () => body };
  };
  f.calls = calls;
  return f;
}

test("anthropic: request shape and text extraction", async () => {
  const f = fakeFetch(() => ({ body: { content: [{ type: "text", text: "hello " }, { type: "text", text: "there" }] } }));
  const ask = makeAsk({ provider: "anthropic", apiKey: "k", fetch: f });
  assert.equal(await ask("prompt"), "hello there");
  const c = f.calls[0];
  assert.equal(c.url, "https://api.anthropic.com/v1/messages");
  assert.equal(c.headers["x-api-key"], "k");
  assert.equal(c.headers["anthropic-version"], "2023-06-01");
  assert.equal(c.body.model, "claude-sonnet-5-5");
  assert.deepEqual(c.body.messages, [{ role: "user", content: "prompt" }]);
});

test("openai-compatible: base URL, bearer token, reply text", async () => {
  const f = fakeFetch(() => ({ body: { choices: [{ message: { content: "hi" } }] } }));
  const ask = makeAsk({ provider: "openai", apiKey: "sk", model: "m1", baseUrl: "http://localhost:11434/v1/", fetch: f });
  assert.equal(await ask("p"), "hi");
  assert.equal(f.calls[0].url, "http://localhost:11434/v1/chat/completions");
  assert.equal(f.calls[0].headers.authorization, "Bearer sk");
  assert.equal(f.calls[0].body.model, "m1");
});

test("API errors become LlmError with the provider's message", async () => {
  const f = fakeFetch(() => ({ status: 429, body: { error: { message: "rate limited" } } }));
  await assert.rejects(makeAsk({ provider: "anthropic", apiKey: "k", fetch: f })("p"),
    e => e instanceof LlmError && e.status === 429 && e.message === "rate limited");
});

test("choosing a backend from the environment", () => {
  assert.equal(askFromEnv({}), null);
  assert.equal(askFromEnv({ ANTHROPIC_API_KEY: "k" }).describe, "anthropic (claude-sonnet-5-5)");
  assert.equal(askFromEnv({ ANTHROPIC_API_KEY: "k", DA_DUN_MODEL: "claude-opus-5-5" }).describe, "anthropic (claude-opus-5-5)");
  assert.equal(askFromEnv({ DA_DUN_LLM_URL: "http://localhost:11434/v1", DA_DUN_MODEL: "llama" }).describe, "openai (llama)");
  assert.throws(() => askFromEnv({ OPENAI_API_KEY: "sk" }), /needs DA_DUN_MODEL/);
  assert.throws(() => askFromEnv({ DA_DUN_LLM: "anthropic" }), /needs ANTHROPIC_API_KEY/);
});
