# Assistant

`/v1/assistant`. Bearer auth. Per-user AI rate limit.

---

## POST /v1/assistant/chat

Streams a reply as Server-Sent Events.

**Body**: `{ "message", "history"? }` — message 1–4000 chars; history up to 20 `{ role: "user" | "assistant", content }`.

**Events**

| Event | Data |
|---|---|
| `token` | `{ "delta" }` — append to the reply |
| `tool_call` | `{ "name" }` — the assistant is reading data |
| `done` | `{ "message", "toolsUsed" }` — final reply |
| `error` | `{ "code", "message" }` — `provider_auth`, `model_not_found`, `too_large`, `quota_exhausted`, `rate_limited`, `unavailable`, `failed` |

---

## POST /v1/assistant/summarize

**Body**: `{ "text" }` — 1–20000 chars.

**200** → `data`: `{ "summary": { "title", "summary", "keyPoints": [] } }`. **502** the model returned an unexpected shape. AI provider failures return their status with a readable message.
