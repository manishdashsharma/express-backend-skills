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
