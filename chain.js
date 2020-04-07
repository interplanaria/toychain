const bsv = require('bsv')
const fs = require('fs')
const sqlite3 = require('better-sqlite3')
const Util = require('./util')
const path = require('path')
const DUST_LIMIT = 546;
/********************************************************************************
const wallet = new Wallet({ xpriv: <xprivKey string> })
const chain = new Chain(wallet)
chain.utxo()                                              // Get all utxos
chain.utxo(1)                                             // Get 1 utxo
chain.utxo(2)                                             // Get 2 utxos
chain.count("utxo")                                       // Get total utxo count
chain.count("all")                                        // Get all output count
chain.add({
  id: <node id>,
  tx: <transaction id for the output>,
  parent: <parent node IDs array>,
  edge: <parent UTXO>,
  spent: 0|1
})
chain.get({ id: <id> })                                   // Get output by id
chain.last()                                              // Get the last output
chain.reset()                                             // Delete all items on the chain
chain.size()                                              // Get the number of all nodes on the chain

// get { nodes: <childNodes>, tx: <signed transaction> }
chain.next(
  { data: <data>, chain: { from: <parent degree>, to: <child degree> } },
  wallet
)                       
********************************************************************************/
class Chain {
  constructor(wallet, miner) {
    if (wallet.id) {
      this.id = wallet.id;
      let dbpath = path.resolve(wallet.meta.storage.path, "db/" + wallet.id)
      if (!fs.existsSync(dbpath)) {
        fs.mkdirSync(dbpath, { recursive: true })
      }
      this.DB = sqlite3(dbpath + "/chain.db")
      const stmt = this.DB.prepare("SELECT * FROM sqlite_master WHERE type='table'");
      const tables = stmt.all();
      const tablenames = tables.map((t) => t.name)
      if (!tablenames.includes("chain")) {
        this.DB.prepare("CREATE TABLE chain (id INTEGER, tx TEXT, parent JSON, edge JSON, spent INTEGER, PRIMARY KEY (id))").run();
      }
    }
    this.miner = miner;
    this.wallet = wallet;
  }
  reset() {
    this.DB.prepare("DELETE FROM chain").run()
  }
  size() {
    let count = this.DB.prepare("SELECT count(*) from chain").get();
    return count ? count["count(*)"] : 0;
  }
  utxo(limit) {
    let sql = "SELECT * FROM chain WHERE spent=0"
    if (limit) sql = sql + " LIMIT " + limit
    let utxo = this.DB.prepare(sql).all();
    utxo.forEach((p) => {
      p.edge = JSON.parse(p.edge)
    })
    return utxo;
  }
  count(cmd) {
    if (cmd === 'utxo') {
      let c = this.DB.prepare("SELECT count(*) FROM chain WHERE spent=0").get()
      return c ? c["count(*)"] : 0;
    } else if (cmd === "all") {
      let c = this.DB.prepare("SELECT count(*) FROM chain").get()
      return c ? c["count(*)"] : 0;
    } else {
      return 0;
    }
  }
  add(o) {
    // 1. Insert an output
    this.DB.prepare("INSERT INTO chain (id, tx, parent, edge, spent) VALUES (@id, @tx, json(@parent), json(@edge), @spent)").run({
      id: o.id,
      tx: o.txid,
      parent: JSON.stringify(o.parent),
      edge: JSON.stringify(o.edge),
      spent: o.spent
    })

    // 2. Update the "spend" attribute of the parent outputs to 1
    this.DB.prepare(`UPDATE chain SET spent=1 WHERE id IN (${o.parent.map(() => '?').join(',')})`).run(o.parent)
  }
  get(q) {
    if (q) {
      if (Array.isArray(q.id)) {
        return this.DB.prepare(`SELECT * FROM chain WHERE id IN (${q.id.map(() => '?').join(',')})`).all(q.id);
      } else {
        return this.DB.prepare("SELECT * FROM chain WHERE id=?").all(q.id);
      }
    } else {
      return this.DB.prepare("SELECT * FROM chain").all()
    }
  }
  last() {
    return this.DB.prepare("SELECT * FROM chain ORDER BY id DESC LIMIT 1").get();
  }
  next(o, wallet) {
    let totalBudget = 0;
    let fee;
    let utxo;
    try {
      utxo = this.utxo(o.edge.in)
      let last = this.last()
      if (!last) {
        throw new Error("please clone a genesis transaction first")
      }

      let headId = (last && last.id ? last.id + 1 : 0);
      let childrenKeys = [];
      if (wallet.meta.derive) {
        // HD derived wallet
        // generate a new address
        let childrenIds = [];
        for(let i=0; i<o.edge.out; i++) {
          childrenIds.push(headId + i)
          wallet.add()
        }
        childrenKeys = wallet.get({ id: childrenIds })
      } else {
        // Single address wallet
        childrenKeys = [];
        let last = wallet.last()
        if (!last) {
          wallet.add()
          last = wallet.last()
        }
        for(let i=0; i<o.edge.out; i++) {
          childrenKeys.push(last)
        }
      }
      let childrenAddrs = childrenKeys.map((k) => {
        return k.address
      })

      // 2. Add previous UTXO to transaction
      let tx = new bsv.Transaction();
      let parentIds = [];
      let parentAddrs = [];
      utxo.forEach((o) => {
        tx = tx.from(o.edge)
        totalBudget += o.edge.satoshis;
        parentIds.push(o.id)
        parentAddrs.push(o.edge.address);
      })

      // Estimate fee using cloned tx
      let clone = new bsv.Transaction(tx)
      for(let address of childrenAddrs) {
        clone.to(address, Math.floor(totalBudget/o.edge.out))
      }
      if (o.out && Array.isArray(o.out)) {
        o.out.forEach((o) => {
          let val = (o.val ? o.val : 0);
          let script = Util.script(o)
          clone.addOutput(new bsv.Transaction.Output({ script: script, satoshis: val }));
        })
      }
      fee = this.miner.get("fee", clone)
      if (totalBudget < fee) {
        throw new Error("incoming balance lower than the calculated fee")
      }
      let outBalance = Math.floor((totalBudget-fee)/o.edge.out)
      if (outBalance <= DUST_LIMIT) {
        throw new Error("dust limit reached")
      }

      // Set the actual transaction
      for(let address of childrenAddrs) {
        tx.to(address, outBalance)
      }

      if (o.out && Array.isArray(o.out)) {
        o.out.forEach((d) => {
          let val = (d.val ? d.val : 0);
          let script = Util.script(d)
          tx.addOutput(new bsv.Transaction.Output({ script: script, satoshis: val }));
        })
      }

      tx.fee(fee);

      let parentKeys = wallet.get({ address: parentAddrs })
      let privKeys = parentKeys.map((key) => {
        return new bsv.PrivateKey(key.priv);
      })
      let signedTx = tx.sign(privKeys)

      let childNodes = childrenAddrs.map((address, i) => {
        return {
          id: last.id + i + 1,
          txid: signedTx.id,
          parent: parentIds,
          edge: {
            address: address,
            txId: signedTx.id,
            outputIndex: i,
            script: signedTx.outputs[i].script.toHex(),
            satoshis: signedTx.outputs[i].satoshis
          },
          spent: 0,
        }
      })
      return {
        in: utxo,
        out: childNodes,
        tx: signedTx,
        budget: totalBudget,
        fee: fee,
      };
    } catch (e) {
      return {
        in: utxo,
        out: null,
        tx: null,
        error: e.toString(),
        budget: totalBudget,
        fee: fee,
      }
    }
  }
}
module.exports = Chain;
