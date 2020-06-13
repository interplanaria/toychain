const bsv = require('bsv')
const fs = require('fs')
const sqlite3 = require('better-sqlite3')
const Util = require('./util')
const path = require('path')
/**************************************************************************************************

const wallet = new Wallet({ xpriv: <xprivKey string> })   // create a Wallet DB from the given xpriv
wallet.add()                                              // add a new key to the wallet
wallet.head()                                             // get the next available key index
wallet.size()                                             // get the total number of keys in the wallet
wallet.last()                                             // get the last key
wallet.reset()                                            // reset all keys in the wallet
wallet.get({ id: 0 })                                     // get key at index 0
wallet.get({ id: [0, 1, 2, 3, 4] })                       // get keys at index 0,1,2,3,4
wallet.address({ address: <address> })                    // get key at <address>
wallet.address({ address: [<address0>, <address1>] })     // get keys at <address0>, <address1>

**************************************************************************************************/
class Wallet {
  constructor(o) {
    // Instantiate or generate a random Xpriv
    this.meta = o;
    if (o && o.xpriv) {
      this.SEED = bsv.HDPrivateKey.fromString(o.xpriv)
    } else {
      console.error('wallet requires a valid xpriv')
      process.exit()
    }
    this.path = Util.HD.path(o)
    if (o.derive && typeof o.derive === 'function') {
      this.derive = o.derive
    } else {
      this.derive = (options) => {
        return options.root + "/" + options.i;
      }
    }
    // Generate a db id with sha256 hash of xpriv + path
    this.id = Util.HD.id({
      xpriv: this.SEED.toString(),
      path: o.path
    })
    // Generate a key database
    this.meta.storage.fullPath = path.resolve(o.storage.path, o.storage.name + "/" + this.id)
    let dbpath = this.meta.storage.fullPath
    if (!fs.existsSync(dbpath)) {
      fs.mkdirSync(dbpath, { recursive: true })
    }
    this.DB = sqlite3(dbpath + "/wallet.db")

    // Create a "key" table if it doesn't exist
    const stmt = this.DB.prepare("SELECT * FROM sqlite_master WHERE type='table'");
    const tables = stmt.all();
    const tablenames = tables.map((t) => t.name)
    if (!tablenames.includes("wallet")) {
      this.DB.prepare("CREATE TABLE wallet (id INTEGER, xpriv, xpub, priv, pub, address, PRIMARY KEY (id))").run()
    }
  }
  head() {
    let val = this.DB.prepare("SELECT * FROM wallet ORDER BY id DESC LIMIT 1").get();
    return !val ? 0 : val.id + 1;
  }
  last() {
    return this.DB.prepare("SELECT * FROM wallet ORDER BY id DESC LIMIT 1").get();
  }
  size() {
    let count = this.DB.prepare("SELECT count(*) from wallet").get();
    return count ? count["count(*)"] : 0;
  }
  reset() {
    this.DB.prepare("DELETE FROM wallet").run()
  }
  generate(index) {
    if (!index) index = this.head()
    let xpriv = this.SEED;
    let next = this.derive({ root: this.path, i: index })
    let xpriv2 = xpriv.deriveChild(next)
    let xpub2 = bsv.HDPublicKey.fromHDPrivateKey(xpriv2)
    let priv2 = xpriv2.privateKey;
    let pub2 = xpriv2.publicKey;
    let address2 = xpriv2.privateKey.toAddress();
    return {
      id: index,
      xpriv: xpriv2.toString(),
      xpub: xpub2.toString(),
      priv: priv2.toString(),
      pub: pub2.toString(),
      address: address2.toString()
    }
  }
  add() {
    let keys = this.generate()
    let stmt = this.DB.prepare("INSERT INTO wallet (id, xpriv, xpub, priv, pub, address) VALUES (@id, @xpriv, @xpub, @priv, @pub, @address)")
    let info = stmt.run(keys)
    return info
  }
  get(o) {
    if (o && o.id) {
      if (Array.isArray(o.id)) {
        const sql = `SELECT * FROM wallet WHERE id IN (${o.id.map(() => '?').join(',')})`;
        return this.DB.prepare(sql).all(o.id);
      } else {
        return this.DB.prepare("SELECT * from wallet WHERE id=?").all(o.id);
      }
    } else if (o && o.address) {
      if (Array.isArray(o.address)) {
        const sql = `SELECT * FROM wallet WHERE address IN (${o.address.map(() => '?').join(',')})`;
        return this.DB.prepare(sql).all(o.address);
      } else {
        return this.DB.prepare("SELECT * from wallet WHERE address=?").all(o.address);
      }
    } else {
        return this.DB.prepare("SELECT * from wallet").all();
    }
  }
}
module.exports = Wallet;
