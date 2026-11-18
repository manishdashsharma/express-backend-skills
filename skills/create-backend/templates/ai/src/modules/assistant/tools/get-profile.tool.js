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
