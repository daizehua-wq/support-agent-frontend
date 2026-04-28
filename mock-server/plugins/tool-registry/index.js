import qichachaCompanyTool from './builtin/qichacha.js';

const toolRegistry = new Map();

export const registerTool = (toolId, definition = {}) => {
  if (!toolId) {
    throw new Error('[tool-registry] toolId is required');
  }

  toolRegistry.set(toolId, {
    id: toolId,
    ...definition,
  });

  return toolRegistry.get(toolId);
};

export const resolveTool = (toolId) => {
  return toolRegistry.get(toolId) || null;
};

export const listRegisteredTools = () => {
  return [...toolRegistry.values()];
};

export const clearRegisteredTools = () => {
  toolRegistry.clear();
};

registerTool(qichachaCompanyTool.name, qichachaCompanyTool);
