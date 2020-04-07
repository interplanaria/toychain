const bsv = require('bsv');
const axios = require('axios');
class Fee {
  constructor(o) {
    if (!o || !o.fee) o.fee = { standard: 1, data: 1 }
    this.set(o.fee)
  }
  set(config) {
    if (config.standard && config.data) {
      this.config = config;
    } else {
      throw new Error("must set both 'standard' and 'data' rates")
    }
  }
  rate(config) {
    return axios.get(config.url, { headers: config.headers })
    .then((res) => {
      let response = JSON.parse(res.data.payload)
      let fees = {};
      response.fees.forEach((f) => {
        fees[f.feeType] = {
          mine: f.miningFee.satoshis/f.miningFee.bytes,
          relay: f.relayFee.satoshis/f.relayFee.bytes
        }
      })
      return fees;
    })
  }
  type(item) {
    return (item.data && item.data.chunks && item.data.chunks[0].opcodenum === 0 && item.data.chunks[1].opcodenum === 106 ? "data": "standard")
  }
  size(item) {
    if (item.type === 'input') {
      return item.script._estimateSize()
    } else if (item.type === 'output') {
      return item.script.getSize()
    } else {
      return item.size;
    }
  }
  get(t) {
    let tx = new bsv.Transaction(t)
    let fee = 0;
    [
      { script: null, size: 4 },  // version
      { script: null, size: 4 },  // locktime
      { script: null, size: bsv.encoding.Varint(tx.inputs.length).toBuffer().length },
      { script: null, size: bsv.encoding.Varint(tx.outputs.length).toBuffer().length },
    ]
    .concat(tx.inputs.map((i) => {
      return { script: i, size: null, type: "input" }
    }))
    .concat(tx.outputs.map((o) => {
      return { script: o, size: null, type: "output" }
    }))
    .forEach((item) => {
      let type = this.type(item);
      let size = this.size(item)
      let rate = this.config[type]
      fee += Math.ceil(size * rate)
    })
    return fee;
  }
}
module.exports = Fee
