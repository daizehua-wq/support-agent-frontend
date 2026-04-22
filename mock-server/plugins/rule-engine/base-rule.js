export default class Rule {
  constructor(options = {}) {
    this.id = options.id || 'rule';
    this.name = options.name || this.id;
    this.enabled = options.enabled !== false;
    this.options = options;
  }

  async match(_context = {}) {
    throw new Error(`[rule-engine] Rule "${this.id}" must implement match(context)`);
  }

  async execute(_context = {}) {
    throw new Error(`[rule-engine] Rule "${this.id}" must implement execute(context)`);
  }
}
