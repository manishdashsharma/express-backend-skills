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
