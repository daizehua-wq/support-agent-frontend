export default class Adapter {
  formatReply(data = {}) {
    throw new Error('Adapter.formatReply(data) must be implemented by subclasses.');
  }
}
