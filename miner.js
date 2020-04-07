const bsv = require('bsv');
const Fee = require('./fee')
class Miner {
  constructor(o) {
    this.fee = new Fee(o)
  }
  set(key, val) {
    if (key === 'fee') {
      this.fee.set(val)
    }
  }
  get(key, val) {
    if (key === 'fee') {
      return this.fee.get(val)
    }
  }
  request(key, val) {
    if (key === 'fee') {
      return this.fee.rate(val)
    }
  }
}
module.exports = Miner
