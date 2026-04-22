import Adapter from './base.js';

export default class WebAdapter extends Adapter {
  formatReply(data = {}) {
    return data;
  }
}
