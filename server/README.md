# da-dun server

A small HTTP API around `@da-dun/core`, with no dependencies beyond Node. It
also serves the built editor, whose hum box then works outside claude.ai.

```sh
npm run build                         # the editor, so the server can serve it
ANTHROPIC_API_KEY=sk-ant-... npm start
# open http://127.0.0.1:8787
```

During development, run `npm start` and `npm run dev` side by side: the Vite dev
server sends `/api` to port 8787.

## Choosing a model

| Variable            | Meaning                                                              |
|---------------------|----------------------------------------------------------------------|
| `ANTHROPIC_API_KEY` | use the Anthropic API (default model `claude-sonnet-5-5`)            |
| `OPENAI_API_KEY`    | use an OpenAI-compatible API (needs `DA_DUN_MODEL`)                  |
| `DA_DUN_LLM`        | `anthropic` or `openai`, when both keys are set                      |
| `DA_DUN_MODEL`      | model name                                                           |
| `DA_DUN_LLM_URL`    | base URL for OpenAI-compatible servers, e.g. `http://localhost:11434/v1` for Ollama (no key needed) |
| `PORT`, `HOST`      | where to listen (default `127.0.0.1:8787`)                           |
| `DA_DUN_CORS`       | allow cross-origin browser calls, e.g. `*` (off by default)          |

Without any model the server still converts notation; only `/api/hum` answers
503. It listens on 127.0.0.1 by default because the hum box spends your API
credits: think before exposing it to a network.

## API

All requests and error responses are JSON. Errors look like
`{"error": "line 2: unknown instrument or drum \"kazoo\"", "code": "notation_error", "line": 2}`.

| Endpoint            | Body                          | Response                                            |
|---------------------|-------------------------------|-----------------------------------------------------|
| `GET /api/health`   |                               | `{ok, hum, llm}`                                    |
| `POST /api/notate`  | `{notation}`                  | `{csv, warnings, title, bars, notes}`               |
| `POST /api/midi`    | `{notation}` or `{csv}`, optional `filename` | a MIDI file (`audio/midi`)           |
| `POST /api/hum`     | `{notation, request}`         | `{notation, explanation, problems, attempts}`       |

```sh
curl -s localhost:8787/api/midi -d '{"notation": "piano: c d e f | g1 |"}' -o scale.mid
curl -s localhost:8787/api/hum -d '{"notation": "piano: a4 R | e R |", "request": "ta-ta-TAAM, rising"}'
```

`/api/hum` runs the same checked loop as the editor: the model's answer is
converted, and any problems go back to it for one repair round. `problems` lists
whatever is left (empty means the notation converts cleanly).

## In code

`createApp()` in `src/app.js` is a plain `(req, res)` handler, so it mounts in
any Node server; `makeAsk()` in `src/llm.js` turns an API into the `ask`
function that `hum()` from `@da-dun/core` needs.
