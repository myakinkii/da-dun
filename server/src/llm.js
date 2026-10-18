// llm.js: turn an LLM HTTP API into an `ask(prompt)` function for hum().
// Two dialects cover most providers:
//   anthropic  the Anthropic Messages API, with an API key or a Claude Code
//              subscription OAuth token (authToken)
//   openai     any OpenAI-compatible chat completions API (OpenAI, OpenRouter,
//              Ollama, LM Studio, vLLM, ...), via baseUrl

export class LlmError extends Error {
  constructor(status, message) { super(message); this.name = "LlmError"; this.status = status; }
}

// Bearer tokens (Claude Code's CLAUDE_CODE_OAUTH_TOKEN) are only accepted with this beta flag.
const OAUTH_BETA = "oauth-2025-04-20";
// ...and the system prompt must open with this line, or the API answers a misleading
// 429 ("rate_limit_error: Error").
const OAUTH_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude.";

/**
 * @param {{provider: "anthropic" | "openai", apiKey?: string, authToken?: string, model?: string,
 *          baseUrl?: string, maxTokens?: number, fetch?: typeof fetch}} opts
 *   authToken: anthropic only, an OAuth bearer token used instead of apiKey
 * @returns {(prompt: string, o?: {signal?: AbortSignal}) => Promise<string>} resolves with the reply text
 */
export function makeAsk({ provider, apiKey, authToken, model, baseUrl, maxTokens = 4000, fetch = globalThis.fetch }) {
  const post = async (url, headers, body, signal) => {
    const res = await fetch(url, { method: "POST", signal, headers: { "content-type": "application/json", ...headers },
                                   body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new LlmError(res.status, (data && data.error && (data.error.message || data.error)) || res.statusText || "request failed");
    return data;
  };
  if (provider === "anthropic") {
    const url = (baseUrl || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages";
    return async (prompt, { signal } = {}) => {
      const auth = authToken ? { authorization: "Bearer " + authToken, "anthropic-beta": OAUTH_BETA } : { "x-api-key": apiKey };
      const data = await post(url, { ...auth, "anthropic-version": "2023-06-01" },
        { model: model || "claude-sonnet-5-5", max_tokens: maxTokens, ...(authToken ? { system: OAUTH_SYSTEM } : {}), messages: [{ role: "user", content: prompt }] }, signal);
      return (data.content || []).map(c => (c.type === "text" ? c.text : "")).join("");
    };
  }
  if (provider === "openai") {
    const url = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions";
    return async (prompt, { signal } = {}) => {
      const data = await post(url, apiKey ? { authorization: "Bearer " + apiKey } : {},
        { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }, signal);
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    };
  }
  throw new Error(`unknown LLM provider "${provider}" (use "anthropic" or "openai")`);
}

/**
 * Pick a backend from environment variables.
 *   DA_DUN_LLM          anthropic | openai (default: whichever key is set)
 *   ANTHROPIC_API_KEY   for anthropic;  OPENAI_API_KEY for openai
 *   CLAUDE_CODE_OAUTH_TOKEN  anthropic with a Claude Code subscription token
 *                       instead of an API key (the API key wins if both are set)
 *   DA_DUN_MODEL        model name (anthropic default: claude-sonnet-5-5; required for openai)
 *   DA_DUN_LLM_URL      base URL, e.g. http://localhost:11434/v1 for Ollama
 * @returns {{ask: Function, describe: string} | null}
 */
export function askFromEnv(env = process.env, fetchImpl = globalThis.fetch) {
  const provider = env.DA_DUN_LLM || (env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN ? "anthropic" : env.OPENAI_API_KEY || env.DA_DUN_LLM_URL ? "openai" : null);
  if (!provider) return null;
  const apiKey = provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const authToken = provider === "anthropic" && !apiKey ? env.CLAUDE_CODE_OAUTH_TOKEN : undefined;
  if (provider === "anthropic" && !apiKey && !authToken) throw new Error("DA_DUN_LLM=anthropic needs ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN");
  if (provider === "openai" && !env.DA_DUN_MODEL) throw new Error("DA_DUN_LLM=openai needs DA_DUN_MODEL");
  const model = env.DA_DUN_MODEL || (provider === "anthropic" ? "claude-sonnet-5-5" : undefined);
  return { ask: makeAsk({ provider, apiKey, authToken, model, baseUrl: env.DA_DUN_LLM_URL, fetch: fetchImpl }),
           describe: `${provider} (${model}${authToken ? ", oauth" : ""})` };
}
