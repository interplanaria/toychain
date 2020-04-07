const bsv = require('bsv')
const crypto = require('crypto')
const bip44 = "m/44'/0'/0'/0"
const script = (out) => {
  if (out.script) {
    return bsv.Script.fromHex(out.script);
  } else {
    let s = new bsv.Script();
    let keys = Object.keys(out).filter((k) => {
      return /[obsh][0-9]+/.test(k)
    })
    let max = -1;
    let chunks = [];
    keys.forEach((key) => {
      let index = parseInt(key.slice(1))
      if (index > max) max = index;
      chunks[index] = {[key]: out[key]}
    })
    for(let i=0; i<=max; i++) {
      if (chunks[i]) {
        let key = Object.keys(chunks[i])[0];
        let val = Object.values(chunks[i])[0];
        if (key.startsWith("o")) {
          s.add(bsv.Opcode[val])
        } else if (key.startsWith("s")) {
          s.add(Buffer.from(val))
        } else if (key.startsWith("h")) {
          s.add(Buffer.from(val, "hex"))
        } else if (key.startsWith("b")) {
          s.add(Buffer.from(val, "base64"))
        }
      } else {
        s.add(bsv.Opcode.OP_FALSE)
      }
    }
    return s;
  }
}
const HD = {
  id: (o) => {
    if (o.xpriv) {
      const path = (o && o.path ? o.path : bip44)
      return crypto.createHash('sha256').update(o.xpriv + "-" + path).digest('hex');
    }
  },
  path: (o) => {
    return (o && o.path ? o.path : bip44)
  },
  isvalid: (str) => {
    try {
      let seed = bsv.HDPrivateKey.fromString(o.xpriv)
      return true;
    } catch (e) {
      return false;
    }
  }
}
module.exports = {
  script: script, HD: HD
}
