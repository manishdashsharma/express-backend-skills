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
