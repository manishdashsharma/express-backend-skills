# AI files

Add these only when the product has AI features, on top of `common.md` and the database bundle.

Files in this bundle: 21.

## `api/assistant.md`

```markdown
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
| `error` | `{ "code", "message" }` — `not_configured`, `provider_auth`, `model_not_found`, `too_large`, `quota_exhausted`, `rate_limited`, `unavailable`, `failed` |

---

## POST /v1/assistant/summarize

**Body**: `{ "text" }` — 1–20000 chars.

**200** → `data`: `{ "summary": { "title", "summary", "keyPoints": [] } }`. **502** the model returned an unexpected shape. AI provider failures return their status with a readable message.
```

## `src/modules/assistant/controllers/assistant.controller.js`

```js
import {
  asyncHandler,
  httpResponse,
  httpError,
  responseMessage,
  logger,
} from '../../../shared/index.js';
import { runAssistantTurnService } from '../services/assistant.service.js';
import { summarizeTextService } from '../services/summarize.service.js';
import { describeAiFailure } from '../services/errors.service.js';

const openEventStream = (res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

const chat = async (req, res) => {
  const send = openEventStream(res);
  const ctx = { user: req.user, requestId: req.requestId };
  try {
    for await (const event of runAssistantTurnService(ctx, req.body)) {
      send(event.type, event.data);
    }
  } catch (error) {
    logger.error('Assistant chat failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      requestId: req.requestId,
    });
    send('error', describeAiFailure(error));
  } finally {
    res.end();
  }
};

const summarize = asyncHandler(async (req, res) => {
  try {
    const summary = await summarizeTextService(req.body);
    logger.info('Text summarized', { userId: req.user.id, requestId: req.requestId });
    return httpResponse(req, res, 200, responseMessage.custom('Summary ready'), { summary });
  } catch (error) {
    logger.error('Summarize failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      requestId: req.requestId,
    });
    const friendly = Object.assign(new Error(describeAiFailure(error).message), {
      statusCode: error.statusCode || 500,
    });
    return httpError(req, res, friendly, friendly.statusCode);
  }
});

export { chat, summarize };
```

## `src/modules/assistant/evals/cases.js`

```js
export const EVAL_CASES = [
  {
    id: 'profile-question-uses-tool',
    message: 'What email is my account using?',
    expect: { calls: ['get_profile'], replyIncludesProfileEmail: true },
  },
  {
    id: 'greeting-needs-no-tool',
    message: 'Hi there',
    expect: { never: ['get_profile'] },
  },
];
```

## `src/modules/assistant/evals/run-evals.js`

```js
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { connectDatabases, disconnectDatabases } from '../../../config/databases.js';
import { disconnectRedis } from '../../../config/redis.js';
import { getMeService } from '../../auth/services/auth.service.js';
import { runAssistantTurnService } from '../services/assistant.service.js';
import { EVAL_CASES } from './cases.js';
import { scoreEvalCase } from './score.js';

const write = (line = '') => process.stdout.write(`${line}\n`);

const runCase = async (ctx, evalCase) => {
  try {
    let done = null;
    const input = { message: evalCase.message, history: [] };
    for await (const event of runAssistantTurnService(ctx, input)) {
      if (event.type === 'done') {
        done = event.data;
      }
    }
    return { reply: done?.message ?? '', toolsUsed: done?.toolsUsed ?? [] };
  } catch (error) {
    return { error: error.message };
  }
};

const run = async () => {
  const { values } = parseArgs({ options: { user: { type: 'string' }, only: { type: 'string' } } });
  if (!values.user) {
    write('Usage: npm run eval:assistant -- --user <userId> [--only id,id]');
    process.exitCode = 1;
    return;
  }
  await connectDatabases();
  const profile = await getMeService(values.user);
  const ctx = { user: { id: values.user }, requestId: 'eval' };
  const only = values.only ? new Set(values.only.split(',')) : null;
  const cases = EVAL_CASES.filter((evalCase) => !only || only.has(evalCase.id));
  let failed = 0;

  for (const evalCase of cases) {
    const result = await runCase(ctx, evalCase);
    const failures = scoreEvalCase(evalCase.expect, result, profile);
    failed += failures.length > 0 ? 1 : 0;
    write(`${failures.length === 0 ? 'PASS' : 'FAIL'} ${evalCase.id}`);
    failures.forEach((failure) => write(`     ${failure}`));
  }

  write(`\n${cases.length - failed}/${cases.length} passed`);
  process.exitCode = failed > 0 ? 1 : 0;
};

run()
  .catch((error) => {
    write(`Eval run failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectRedis();
    await disconnectDatabases();
  });
```

## `src/modules/assistant/evals/score.js`

```js
const scoreEvalCase = (expect, result, profile) => {
  if (result.error) {
    return [`turn failed: ${result.error}`];
  }
  const failures = [];
  (expect.calls ?? []).forEach((name) => {
    if (!result.toolsUsed.includes(name)) {
      failures.push(`expected a ${name} call`);
    }
  });
  (expect.never ?? []).forEach((name) => {
    if (result.toolsUsed.includes(name)) {
      failures.push(`should not call ${name}`);
    }
  });
  if (expect.replyIncludesProfileEmail && !result.reply.includes(profile.email)) {
    failures.push('reply does not mention the profile email');
  }
  return failures;
};

export { scoreEvalCase };
```

## `src/modules/assistant/index.js`

```js
export { default as assistantRoutes } from './routes/assistant.route.js';
```

## `src/modules/assistant/prompt/summarize.prompt.js`

```js
const SUMMARIZE_SYSTEM_PROMPT = [
  'You summarize text for a busy reader.',
  'Reply with JSON only, matching exactly:',
  '{ "title": string (max 120 chars), "summary": string (max 2000 chars),',
  '  "keyPoints": string[] (max 10 items, each max 300 chars) }',
  'Use only facts present in the text.',
].join('\n');

const buildSummarizePrompt = (text) => `Text to summarize:\n"""\n${text}\n"""`;

export { SUMMARIZE_SYSTEM_PROMPT, buildSummarizePrompt };
```

## `src/modules/assistant/prompt/system.prompt.js`

```js
const buildSystemPrompt = ({ appName, now }) => [
  `You are the assistant inside ${appName}.`,
  'Answer briefly and concretely.',
  'Use the tools to read real data before answering questions about the user or their records.',
  'Never invent ids, names, numbers or dates. If a tool returns nothing, say so.',
  'If you need information the user has not given, ask one short question.',
  `Current time: ${now.toISOString()}.`,
].join('\n');

export { buildSystemPrompt };
```

## `src/modules/assistant/routes/assistant.route.js`

```js
import express from 'express';
import { authenticate, validateRequest, aiLimiter } from '../../../shared/index.js';
import { chat, summarize } from '../controllers/assistant.controller.js';
import { chatSchema, summarizeSchema } from '../validations/assistant.schema.js';

const router = express.Router();

router.use(authenticate);

router.post('/chat', aiLimiter, validateRequest(chatSchema, 'body'), chat);
router.post('/summarize', aiLimiter, validateRequest(summarizeSchema, 'body'), summarize);

export default router;
```

## `src/modules/assistant/services/assistant.service.js`

```js
import config from '../../../config/index.js';
import { logger } from '../../../shared/index.js';
import { ai } from '../../../shared/ai/index.js';
import { buildSystemPrompt } from '../prompt/system.prompt.js';
import { TOOL_DEFINITIONS, TOOL_MAP } from '../tools/index.js';
import { streamModel, addUsage } from './model.service.js';

const MAX_STEPS = 6;
const MAX_TOKENS_PER_CALL = 800;
const MAX_TOOL_RESULT_CHARS = 4000;

const parseArguments = (raw) => {
  try {
    return { args: raw ? JSON.parse(raw) : {} };
  } catch {
    return { error: 'Invalid tool arguments' };
  }
};

const runTool = async (toolCall, ctx) => {
  const tool = TOOL_MAP.get(toolCall.function.name);
  if (!tool) {
    return { error: `Unknown tool: ${toolCall.function.name}` };
  }
  const { args, error } = parseArguments(toolCall.function.arguments);
  if (error) {
    return { error };
  }
  try {
    return await tool.handler(args, ctx);
  } catch (toolError) {
    logger.error('Assistant tool failed', {
      tool: toolCall.function.name,
      error: toolError.message,
      userId: ctx.user.id,
    });
    return { error: toolError.statusCode < 500 ? toolError.message : 'Tool failed' };
  }
};

const toToolMessage = (toolCall, result) => ({
  role: 'tool',
  tool_call_id: toolCall.id,
  content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS),
});

const runAssistantTurnService = async function* runAssistantTurnService(ctx, { message, history }) {
  const startedAt = Date.now();
  const messages = [
    { role: 'system', content: buildSystemPrompt({ appName: config.appName, now: new Date() }) },
    ...history,
    { role: 'user', content: message },
  ];
  let usage = { promptTokens: 0, completionTokens: 0 };
  const toolsUsed = [];
  let reply = '';

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const result = yield* streamModel(ai, {
      messages,
      tools: TOOL_DEFINITIONS,
      maxTokens: MAX_TOKENS_PER_CALL,
    });
    usage = addUsage(usage, result.usage);

    if (result.toolCalls.length === 0) {
      reply = result.content;
      break;
    }

    messages.push({ role: 'assistant', content: result.content || null, tool_calls: result.toolCalls });
    result.toolCalls.forEach((toolCall) => toolsUsed.push(toolCall.function.name));
    yield* result.toolCalls.map((toolCall) => ({
      type: 'tool_call',
      data: { name: toolCall.function.name },
    }));

    const results = await Promise.all(result.toolCalls.map((toolCall) => runTool(toolCall, ctx)));
    result.toolCalls.forEach((toolCall, index) => {
      messages.push(toToolMessage(toolCall, results[index]));
    });
  }

  if (!reply) {
    reply = 'I could not finish that in time. Try asking in a simpler way.';
    yield { type: 'token', data: { delta: reply } };
  }

  logger.info('Assistant turn completed', {
    userId: ctx.user.id,
    requestId: ctx.requestId,
    model: ai.model,
    toolsUsed,
    ...usage,
    durationMs: Date.now() - startedAt,
  });

  yield { type: 'done', data: { message: reply, toolsUsed } };
};

export { runAssistantTurnService };
```

## `src/modules/assistant/services/errors.service.js`

```js
const AI_FAILURES = [
  [(error) => error?.code === 'ai_not_configured', 'not_configured',
    'AI is not set up on this server yet.'],
  [(error) => error?.statusCode === 401 || error?.statusCode === 403, 'provider_auth',
    'The AI provider rejected the API key. Check the key in settings.'],
  [(error) => error?.statusCode === 404, 'model_not_found',
    'The AI model was not found. Check the model name in settings.'],
  [(error) => error?.statusCode === 413, 'too_large',
    'That is too long for the model. Shorten it and try again.'],
  [(error) => /tokens per day|daily/i.test(error?.message ?? '') && error?.statusCode === 429,
    'quota_exhausted', 'The AI provider\'s daily limit is used up. Try again later.'],
  [(error) => error?.statusCode === 429, 'rate_limited',
    'The AI provider is busy right now. Try again in a moment.'],
  [(error) => error?.statusCode >= 500 || error?.name === 'APIConnectionError', 'unavailable',
    'The AI provider is not responding. Try again shortly.'],
];

const describeAiFailure = (error) => {
  if (error?.provider !== 'ai') {
    return {
      code: 'failed',
      message: error?.statusCode < 500 ? error.message : 'Something went wrong. Try again.',
    };
  }
  const match = AI_FAILURES.find(([matches]) => matches(error));
  return match
    ? { code: match[1], message: match[2] }
    : { code: 'failed', message: 'Something went wrong. Try again.' };
};

export { describeAiFailure };
```

## `src/modules/assistant/services/model.service.js`

```js
const mergeToolCallDeltas = (accumulated, deltas) => deltas.reduce((calls, delta) => {
  const index = delta.index ?? 0;
  const current = calls[index] ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
  const next = {
    ...current,
    id: delta.id || current.id,
    function: {
      name: current.function.name + (delta.function?.name ?? ''),
      arguments: current.function.arguments + (delta.function?.arguments ?? ''),
    },
  };
  return Object.assign([...calls], { [index]: next });
}, accumulated);

const addUsage = (tally, usage) => ({
  promptTokens: tally.promptTokens + (usage?.prompt_tokens ?? 0),
  completionTokens: tally.completionTokens + (usage?.completion_tokens ?? 0),
});

const streamModel = async function* streamModel(client, params) {
  let content = '';
  let toolCalls = [];
  let finishReason = null;
  let usage = null;

  for await (const chunk of client.stream(params)) {
    if (chunk.content) {
      content += chunk.content;
      yield { type: 'token', data: { delta: chunk.content } };
    }
    if (chunk.toolCallDeltas) {
      toolCalls = mergeToolCallDeltas(toolCalls, chunk.toolCallDeltas);
    }
    finishReason = chunk.finishReason ?? finishReason;
    usage = chunk.usage ?? usage;
  }

  return { content, toolCalls: toolCalls.filter(Boolean), finishReason, usage };
};

export { streamModel, addUsage };
```

## `src/modules/assistant/services/summarize.service.js`

```js
import { ai } from '../../../shared/ai/index.js';
import { SUMMARIZE_SYSTEM_PROMPT, buildSummarizePrompt } from '../prompt/summarize.prompt.js';
import { summaryResultSchema } from '../validations/assistant.schema.js';

const summarizeTextService = async ({ text }) => {
  const raw = await ai.json({
    system: SUMMARIZE_SYSTEM_PROMPT,
    prompt: buildSummarizePrompt(text),
    temperature: 0.2,
    maxTokens: 900,
  });
  const parsed = summaryResultSchema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error('The AI returned an unexpected answer. Try again.');
    error.statusCode = 502;
    throw error;
  }
  return parsed.data;
};

export { summarizeTextService };
```

## `src/modules/assistant/tools/get-profile.tool.js`

```js
import { getMeService } from '../../auth/services/auth.service.js';

const definition = {
  type: 'function',
  function: {
    name: 'get_profile',
    description: 'Get the signed-in user\'s profile: name, email, role and when they joined.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
};

const handler = async (_args, ctx) => {
  const user = await getMeService(ctx.user.id);
  return { name: user.name, email: user.email, role: user.role, joinedAt: user.createdAt };
};

export const getProfileTool = { definition, handler, requiresApproval: false };
```

## `src/modules/assistant/tools/index.js`

```js
import { getProfileTool } from './get-profile.tool.js';

const ASSISTANT_TOOLS = [getProfileTool];

const TOOL_DEFINITIONS = ASSISTANT_TOOLS.map((tool) => tool.definition);

const TOOL_MAP = new Map(ASSISTANT_TOOLS.map((tool) => [tool.definition.function.name, tool]));

export { ASSISTANT_TOOLS, TOOL_DEFINITIONS, TOOL_MAP };
```

## `src/modules/assistant/validations/assistant.schema.js`

```js
import { z } from 'zod';

const historyMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

export const chatSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(4000),
  history: z.array(historyMessage).max(20).default([]),
});

export const summarizeSchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(20000),
});

export const summaryResultSchema = z.object({
  title: z.string().max(120),
  summary: z.string().max(2000),
  keyPoints: z.array(z.string().max(300)).max(10),
});
```

## `src/shared/ai/ai.js`

```js
import OpenAI from 'openai';
import config from '../../config/index.js';
import logger from '../utils/logger.js';

const EAIRole = Object.freeze({ SYSTEM: 'system', USER: 'user', ASSISTANT: 'assistant' });

const AI_GENERATION_DEFAULTS = { temperature: 0.7, maxTokens: 1024 };
const AI_REQUEST_DEFAULTS = { timeout: 30000, maxRetries: 2 };
const AI_RESPONSE_FORMAT = { JSON: { type: 'json_object' } };

const toAIError = (error, fallbackMessage) => {
  if (error?.statusCode) {
    return error;
  }
  const aiError = new Error(error?.message || fallbackMessage);
  aiError.statusCode = error?.status || 502;
  aiError.provider = 'ai';
  return aiError;
};

const notConfigured = () => {
  const error = new Error('AI is not configured on this server');
  error.statusCode = 503;
  error.provider = 'ai';
  error.code = 'ai_not_configured';
  return error;
};

const requireMessages = (messages, operation) => {
  if (messages.length === 0) {
    const error = new Error(`AI ${operation} requires a prompt or messages`);
    error.statusCode = 400;
    throw error;
  }
};

class AIClient {
  constructor(options = {}) {
    const apiKey = options.apiKey || config.ai.apiKey;
    this.client = apiKey
      ? new OpenAI({
        apiKey,
        baseURL: options.baseURL || config.ai.baseURL,
        timeout: options.timeout || AI_REQUEST_DEFAULTS.timeout,
        maxRetries: options.maxRetries ?? AI_REQUEST_DEFAULTS.maxRetries,
      })
      : null;
    this.model = options.model || config.ai.model;
    this.embeddingModel = options.embeddingModel || config.ai.embeddingModel;
    this.defaults = {
      temperature: options.temperature ?? AI_GENERATION_DEFAULTS.temperature,
      maxTokens: options.maxTokens ?? AI_GENERATION_DEFAULTS.maxTokens,
      reasoningEffort: options.reasoningEffort,
    };
  }

  buildMessages({ system, prompt, messages } = {}) {
    return [
      ...(system ? [{ role: EAIRole.SYSTEM, content: system }] : []),
      ...(Array.isArray(messages) ? messages : []),
      ...(prompt ? [{ role: EAIRole.USER, content: prompt }] : []),
    ];
  }

  resolveParams(overrides = {}) {
    const reasoningEffort = overrides.reasoningEffort ?? this.defaults.reasoningEffort;
    return {
      model: overrides.model || this.model,
      temperature: overrides.temperature ?? this.defaults.temperature,
      max_tokens: overrides.maxTokens ?? this.defaults.maxTokens,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(overrides.responseFormat ? { response_format: overrides.responseFormat } : {}),
      ...(overrides.tools ? { tools: overrides.tools } : {}),
      ...(overrides.toolChoice ? { tool_choice: overrides.toolChoice } : {}),
    };
  }

  requireClient() {
    if (!this.client) {
      throw notConfigured();
    }
    return this.client;
  }

  async chat(input = {}) {
    const client = this.requireClient();
    const messages = this.buildMessages(input);
    requireMessages(messages, 'chat');
    try {
      const response = await client.chat.completions.create({
        ...this.resolveParams(input),
        messages,
      });
      const choice = response.choices?.[0];
      return {
        content: choice?.message?.content ?? '',
        toolCalls: choice?.message?.tool_calls ?? null,
        finishReason: choice?.finish_reason ?? null,
        usage: response.usage ?? null,
        model: response.model,
      };
    } catch (error) {
      logger.error('AI chat request failed', { error: error.message, model: this.model });
      throw toAIError(error, 'AI chat request failed');
    }
  }

  async json(input = {}) {
    const response = await this.chat({ ...input, responseFormat: AI_RESPONSE_FORMAT.JSON });
    try {
      return JSON.parse(response.content);
    } catch (error) {
      throw toAIError({ message: `AI returned invalid JSON: ${error.message}` }, 'Invalid JSON');
    }
  }

  async *stream(input = {}) {
    const client = this.requireClient();
    const messages = this.buildMessages(input);
    requireMessages(messages, 'stream');
    let completion;
    try {
      completion = await client.chat.completions.create({
        ...this.resolveParams(input),
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });
    } catch (error) {
      logger.error('AI stream request failed', { error: error.message, model: this.model });
      throw toAIError(error, 'AI stream request failed');
    }
    for await (const chunk of completion) {
      const choice = chunk.choices?.[0];
      yield {
        content: choice?.delta?.content ?? null,
        toolCallDeltas: choice?.delta?.tool_calls ?? null,
        finishReason: choice?.finish_reason ?? null,
        usage: chunk.usage ?? null,
      };
    }
  }

  async embed(input, options = {}) {
    const client = this.requireClient();
    try {
      const response = await client.embeddings.create({
        model: options.model || this.embeddingModel,
        input,
      });
      return response.data.map((item) => item.embedding);
    } catch (error) {
      logger.error('AI embedding request failed', { error: error.message });
      throw toAIError(error, 'AI embedding request failed');
    }
  }
}

const ai = new AIClient();

export { AIClient, ai, EAIRole, AI_RESPONSE_FORMAT, toAIError };
```

## `src/shared/ai/index.js`

```js
export { AIClient, ai, EAIRole, AI_RESPONSE_FORMAT, toAIError } from './ai.js';
export { createModelPool } from './model-pool.js';
```

## `src/shared/ai/model-pool.js`

```js
const DEFAULT_COOLDOWN_MS = 60000;

const isRetryable = (error) => error?.statusCode === 429 || error?.statusCode >= 500;

const createModelPool = (clients, { cooldownMs = DEFAULT_COOLDOWN_MS } = {}) => {
  const blockedUntil = new Map();

  const available = (exclude, now) => clients.filter((client) =>
    !exclude.has(client.model) && (blockedUntil.get(client.model) ?? 0) <= now);

  const block = (model, now) => blockedUntil.set(model, now + cooldownMs);

  const stream = async function* stream(params) {
    const attempted = new Set();
    for (;;) {
      const [client] = available(attempted, Date.now());
      if (!client) {
        const error = new Error('Every AI model is busy right now');
        error.statusCode = 503;
        error.provider = 'ai';
        throw error;
      }
      attempted.add(client.model);
      let emitted = false;
      try {
        for await (const chunk of client.stream(params)) {
          emitted = true;
          yield chunk;
        }
        return;
      } catch (error) {
        if (emitted || !isRetryable(error)) {
          throw error;
        }
        block(client.model, Date.now());
      }
    }
  };

  return { stream, get model() { return available(new Set(), Date.now())[0]?.model ?? null; } };
};

export { createModelPool };
```

## `src/shared/crypto/secret-box.js`

```js
import crypto from 'crypto';
import config from '../../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const getKey = () => {
  const key = Buffer.from(config.ai.keyEncryptionSecret || '', 'hex');
  if (key.length !== 32) {
    const error = new Error('Encryption is not configured');
    error.statusCode = 503;
    throw error;
  }
  return key;
};

const encryptSecret = (plaintext) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
};

const decryptSecret = (ciphertext) => {
  const buffer = Buffer.from(ciphertext, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

const lastFour = (secret) => secret.slice(-4);

export { encryptSecret, decryptSecret, lastFour };
```

## `src/shared/network/ssrf-guard.js`

```js
import { lookup } from 'dns/promises';
import net from 'net';
import config from '../../config/index.js';

const BLOCKED_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 4],
];

const blockList = new net.BlockList();
BLOCKED_V4.forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv4'));
blockList.addAddress('::1', 'ipv6');
blockList.addSubnet('fc00::', 7, 'ipv6');
blockList.addSubnet('fe80::', 10, 'ipv6');

const rejected = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const assertPublicUrl = async (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw rejected('Enter a valid URL');
  }
  if (config.ai.allowPrivateHosts) {
    return url;
  }
  if (url.protocol !== 'https:') {
    throw rejected('The URL must use https');
  }
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw rejected('That host could not be resolved');
  }
  const blocked = addresses.find(({ address, family }) =>
    blockList.check(address, family === 6 ? 'ipv6' : 'ipv4'));
  if (blocked) {
    throw rejected('That host is not allowed');
  }
  return url;
};

export { assertPublicUrl };
```
