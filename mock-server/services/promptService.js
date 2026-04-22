
import {
  getAssistantById,
  getAssistantPromptBindings,
  getDefaultAssistantProfile,
  getEnabledAssistants,
  getPromptById,
  getPromptForAssistantModule,
  getPromptsByAssistant,
  getPromptsByModule,
  listAssistants,
  listPrompts,
} from './governanceRegistryService.js';

const getAssistantProfiles = () => listAssistants();

const getPromptRegistry = () => listPrompts();

const getEnabledAssistantProfiles = () => getEnabledAssistants();

const getAssistantBindings = (assistantId = '') => getAssistantPromptBindings(assistantId);

const getPromptForModule = (assistantId = '', module = '') =>
  getPromptForAssistantModule(assistantId, module);

const getPromptContentForModule = (assistantId = '', module = '') => {
  const prompt = getPromptForModule(assistantId, module);
  return prompt?.content || '';
};

export {
  getAssistantProfiles,
  getPromptRegistry,
  getEnabledAssistantProfiles,
  getAssistantById,
  getDefaultAssistantProfile,
  getPromptById,
  getPromptsByModule,
  getPromptsByAssistant,
  getAssistantBindings,
  getPromptForModule,
  getPromptContentForModule,
};
