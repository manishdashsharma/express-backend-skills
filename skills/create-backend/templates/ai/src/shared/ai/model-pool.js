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
