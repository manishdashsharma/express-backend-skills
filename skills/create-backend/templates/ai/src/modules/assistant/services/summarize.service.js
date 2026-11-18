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
