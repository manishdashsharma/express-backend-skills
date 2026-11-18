import { getProfileTool } from './get-profile.tool.js';

const ASSISTANT_TOOLS = [getProfileTool];

const TOOL_DEFINITIONS = ASSISTANT_TOOLS.map((tool) => tool.definition);

const TOOL_MAP = new Map(ASSISTANT_TOOLS.map((tool) => [tool.definition.function.name, tool]));

export { ASSISTANT_TOOLS, TOOL_DEFINITIONS, TOOL_MAP };
