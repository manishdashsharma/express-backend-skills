const AI_FAILURES = [
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
