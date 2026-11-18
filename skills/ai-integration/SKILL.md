---
name: ai-integration
description: Add LLM features to a Node.js backend with any OpenAI-compatible provider — AI config block, a shared AIClient (chat, json, stream, embed), bring-your-own-key storage with AES-256-GCM, key verification, SSRF guard on custom base URLs, model pool with cooldown and fallback, SSE streaming endpoints, tool-calling agent loops with human approval, usage logging without prompt content, friendly provider errors, per-user AI rate limits and evals. Use when building AI chat, assistants, agents, summarization, extraction, embeddings or BYOK settings in an Express backend.
---

# AI Integration

Tested templates live in the sibling `create-backend` skill at `../create-backend/templates/ai/`, already at their final paths:

```
src/shared/ai/ai.js                AIClient: chat, json, stream, embed
src/shared/ai/model-pool.js        createModelPool: cooldown + fallback across models
src/shared/ai/index.js             barrel — modules import from shared/ai/index.js
src/shared/crypto/secret-box.js    encryptSecret, decryptSecret, lastFour (AES-256-GCM)
src/shared/network/ssrf-guard.js   assertPublicUrl for user-supplied base URLs
src/modules/assistant/             a complete AI module (see layout below)
api/assistant.md                   its API doc
```

The `ai` config block and `AI_*` env vars are in `../create-backend/templates/common/src/config/index.js` and `.env.example`. For an existing project, copy the overlay, merge that config block, add `openai`, mount `assistantRoutes`, and rename `assistant` to the feature.

## AI module layout

```
src/modules/<name>/
  controllers/<name>.controller.js   SSE + JSON endpoints, maps provider errors to messages
  services/<name>.service.js         the turn: async generator, agent loop, usage log
  services/model.service.js          streams one model call, merges tool-call deltas
  services/summarize.service.js      one-shot JSON task validated by Zod
  services/errors.service.js         describeAiFailure: provider status → user message
  routes/<name>.route.js             authenticate → aiLimiter → validateRequest → controller
  validations/<name>.schema.js       request schemas + the schema model JSON must match
  prompt/<purpose>.prompt.js         system prompts and prompt builders, nothing else
  tools/<verb>-<noun>.tool.js        { definition, handler, requiresApproval }
  tools/index.js                     TOOL_DEFINITIONS + TOOL_MAP
  evals/cases.js                     inputs and expectations
  evals/score.js                     pure scoring, unit-testable
  evals/run-evals.js                 runs real turns, prints PASS/FAIL, exit code 1 on failure
  index.js                           export { default as <name>Routes }
```

Prompts never live inline in services. Tools never contain business logic — they call the module services the REST API uses.

Install only `openai`. It speaks to any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Together, DeepSeek, Mistral, Gemini's OpenAI endpoint, local Ollama) through `baseURL`.

## Config

```
AI_API_KEY=                      shared/server key (optional if BYOK only)
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_MODEL_POOL=                   comma list for fallback, optional
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_KEY_ENCRYPTION_SECRET=        64 hex chars (32 bytes), different per environment
ALLOW_PRIVATE_AI_HOSTS=false     true only for self-hosted installs (Ollama on localhost)
```

Generate the secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Rotating it makes stored keys unreadable, so rotation is a re-encrypt script, never a swap.

## Using the client

```js
import { ai, AIClient, createModelPool } from '../../../shared/ai/index.js';

const summary = await ai.chat({ system: SUMMARY_PROMPT, prompt: text, maxTokens: 300 });
const fields = await ai.json({ system: EXTRACT_PROMPT, prompt: text });
const vectors = await ai.embed(['first', 'second']);
const userClient = new AIClient({ apiKey, baseURL, model, maxRetries: 0 });
const pool = createModelPool(config.ai.modelPool.map((model) => new AIClient({ model, maxRetries: 0 })));
```

- AI calls live in services, never controllers.
- Prompts live in `modules/<name>/prompt/<purpose>.prompt.js` as exported builders, not inline strings scattered through services.
- Validate model JSON with Zod before using it. A model is untrusted input.
- Errors become `statusCode`-carrying errors with `provider: 'ai'` (`toAIError`), so the controller can map them.

## Bring your own key (BYOK)

Store per user/org: `baseUrl`, `model`, `keyCiphertext`, `keyLast4`, `lastVerifiedAt`, `isActive`.

1. On save: `assertPublicUrl(baseUrl)` → verify with a tiny call (`chat({ prompt: 'hi', maxTokens: 5 })`, `timeout: 10000`, `maxRetries: 0`) → `encryptSecret(apiKey)` → store ciphertext + `lastFour(apiKey)`.
2. Responses show `keyLast4` and `hasKey` only. The key never appears in a response, log, error, analytics event or API doc example.
3. On use: decrypt in memory for one call, build an `AIClient`, discard. Re-run `assertPublicUrl` on every call because DNS can change.
4. A partial update (model only) re-verifies with the stored key.
5. Decrypt failure → log and fall back to the shared provider (or a clear 400 "re-enter your key"), never a 500 with the cause.

## SSRF guard

A user-supplied `baseUrl` lets someone point your server at internal addresses. On hosted deployments require `https` and reject hosts resolving to private, loopback, link-local, CGNAT or cloud-metadata ranges (`169.254.169.254`). `ALLOW_PRIVATE_AI_HOSTS=true` disables the check for self-hosted installs only.

## Streaming over SSE

```js
const chat = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    for await (const chunk of runTurnService(ctx, req.body)) {
      send(chunk.type, chunk.data);
    }
  } catch (error) {
    logger.error('AI chat failed', { error: error.message, stack: error.stack, requestId: req.requestId });
    send('error', describeFailure(error));
  } finally {
    res.end();
  }
};
```

- The service is an `async function*` that yields typed events (`token`, `tool_call`, `tool_result`, `approval_required`, `waiting`, `done`). The controller only translates them to SSE.
- Headers are already sent, so errors become an `error` event — never `httpError` after `flushHeaders`.
- `X-Accel-Buffering: no` stops nginx from buffering the stream.
- Stream with `stream_options: { include_usage: true }` to get token counts.

## Model pool and fallback

For shared keys on rate-limited providers, give the turn a pool of models. On `429` put the model in cooldown (use the provider's "try again in Xs" hint when present), on `429`/`5xx` move to the next model that is not cooling. Only retry **before** the first token streamed; once output has started, surface the error. Optionally fall back to a second provider as a last resort. See `createModelPool` in `src/shared/ai/model-pool.js`.

## Tool-calling agent loop

```
messages = [system, ...history, user]
for step in 0..MAX_TURNS:
  result = model(messages, tools)
  if no tool calls → return result.content
  push assistant message with tool_calls
  run all tool calls in Promise.all → push one `tool` message per call (JSON result)
return "ran out of steps" reply listing what did complete
```

Rules that keep agents safe:
- **One file per tool**: `tools/<verb>-<noun>.tool.js` exporting `{ definition, handler, requiresApproval?, plan? }`; `tools/index.js` builds `TOOL_DEFINITIONS` and a `TOOL_MAP` by name.
- Tool definitions use JSON Schema with `additionalProperties: false`; parse arguments in try/catch and validate before use.
- Handlers call the **same services** the REST API uses, with the caller's identity and scope — the agent can never do more than the user could.
- **Writes require approval.** `requiresApproval` tools do not run; `plan()` produces a human summary, a pending-action record is saved (expires in 24 h), and the stream emits `approval_required`. A separate `POST .../actions/resolve` applies or rejects. If the model claims it "did" something still pending, append a correction.
- Reject arguments the user never said (e.g. an invented assignee or due date) and tell the model to ask instead.
- Cap steps (`MAX_TURNS`) and `maxTokens` per call. Truncate tool results and history (last N messages).
- Select a subset of tools per request when you have many; fewer tools → better tool choice on small models.

## Usage, privacy, limits

- Log one usage row per turn: `userId`, scope id, feature/route, provider, model, prompt/completion tokens, model calls, tool calls, duration, status. **Never** prompt or completion text unless the product explicitly stores conversations.
- Usage logging failures are caught and logged; they never fail the user's request.
- Per-user rate limit on AI routes even with BYOK, so your server is not a free proxy. Shared-key plans get a daily cap counted from the usage table.

## Friendly errors

Map provider failures to sentences the user can act on:

| Provider status | Message |
|---|---|
| 401 / 403 | Your API key was rejected. Check it in settings. |
| 404 | Model not found. Check the model name. |
| 413 | That conversation is too long. Start a new chat. |
| 429 (daily quota) | The provider's daily limit is used up. |
| 429 | Busy right now, try again in about N seconds. |
| 5xx / connection | The AI provider is not responding. Try again shortly. |

Never surface a raw provider body or stack.

## Evals

For any agent or prompt that matters, keep `modules/<name>/evals/`: `cases.js` (input → expected tool calls / never-call / required fields), `score.js` (pure, unit-testable), and `run-evals.js` (a script that runs real turns against a fixture tenant, prints pass/fail, cleans up). Run with `npm run eval:<name>` before changing prompts or models.
