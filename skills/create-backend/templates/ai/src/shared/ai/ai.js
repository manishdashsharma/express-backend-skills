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
    if (!apiKey) {
      logger.warn('AIClient created without an API key');
    }
    this.client = new OpenAI({
      apiKey: apiKey || 'missing-api-key',
      baseURL: options.baseURL || config.ai.baseURL,
      timeout: options.timeout || AI_REQUEST_DEFAULTS.timeout,
      maxRetries: options.maxRetries ?? AI_REQUEST_DEFAULTS.maxRetries,
    });
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

  async chat(input = {}) {
    const messages = this.buildMessages(input);
    requireMessages(messages, 'chat');
    try {
      const response = await this.client.chat.completions.create({
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
    const messages = this.buildMessages(input);
    requireMessages(messages, 'stream');
    let completion;
    try {
      completion = await this.client.chat.completions.create({
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
    try {
      const response = await this.client.embeddings.create({
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
