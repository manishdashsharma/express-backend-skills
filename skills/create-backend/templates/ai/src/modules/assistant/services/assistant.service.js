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
