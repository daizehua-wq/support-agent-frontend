import Rule from '../base-rule.js';

export default class SearchLlmRule extends Rule {
  constructor(options = {}) {
    super({
      id: 'llm-rule',
      name: 'Search LLM Rule',
      ...options,
    });
  }

  async match(_context = {}) {
    return false;
  }

  async execute(_context = {}) {
    return {
      priority: 0,
      matchedRules: [],
      matchedProducts: [],
      documents: [],
    };
  }
}
