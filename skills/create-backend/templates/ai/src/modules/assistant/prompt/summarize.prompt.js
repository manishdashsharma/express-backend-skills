const SUMMARIZE_SYSTEM_PROMPT = [
  'You summarize text for a busy reader.',
  'Reply with JSON only, matching exactly:',
  '{ "title": string (max 120 chars), "summary": string (max 2000 chars),',
  '  "keyPoints": string[] (max 10 items, each max 300 chars) }',
  'Use only facts present in the text.',
].join('\n');

const buildSummarizePrompt = (text) => `Text to summarize:\n"""\n${text}\n"""`;

export { SUMMARIZE_SYSTEM_PROMPT, buildSummarizePrompt };
