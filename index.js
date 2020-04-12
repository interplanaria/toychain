const bsv = require('bsv')
const axios = require('axios')
const fs = require('fs')
const Wallet = require('./wallet')
const Tx = require('./tx')
const Chain = require('./chain')
const Util = require('./util')
const Miner = require('./miner')
/****************************************************************************************

// Create a chain that generates a single address and reuses it.
const chain = new Toychain({
  xpriv: <xprivKey string>,
})

// Create a chain that generates a new key from xprivkey for every new node
const chain = new Toychain({
  xpriv: <xprivKey string>,
  derive: true
})

// Create a chain that generates a new key from xprivkey for every new node
const chain = new Toychain({
  xpriv: <xprivKey string>,
  derive: (o) => {
    return o.root + "/" + o.i
  }
})

// Create a chain that generates a new key from xprivkey for every new node
const chain = new Toychain({
  xpriv: <xprivKey string>,
  path: "m/44'/0'/0'/0/0"
  derive: (o) => {
    return o.root + "/" + o.i
  }
})

// Create a chain that uses the fee rate specified by the `fee` attribute.
const chain = new Toychain({
  xpriv: <xprivKey string>,
  fee: { standard: 1, data: 1 }
})


// Create a chain at path `process.cwd()`
const chain = new Toychain({
  xpriv: <xprivKey string>,
  storage: { path: process.cwd() }
})



// Create a new data transaction while splitting the balance from 1 input to 2 new outputs,
// Using a SINGLE address
chain.add({
  out: [{ "o0": "OP_0", "o1": "OP_RETURN", "s2": "Hello" }],
  chain: { in: 1, out: 2 }
})

// Create a new data transaction while joining the balance from 2 inputs to 1 new output
chain.add({
  out: [{ "o0": "OP_0", "o1": "OP_RETURN", "s2": "Hello" }],
  chain: { from: 2, to: 1 }
})

// Inject external funds into the chain
chain.clone({ tx: <raw transaction hex> })

// Broadcast all unsent transactions to an endpoint
chain.push()

// Broadcast one transaction to an endpoint
chain.push({ id: <txid> })

// Broadcast multiple  transactions to an endpoint
chain.push({ id: [<txid0>, <txid1>, ...] })

// Get the entire chain
chain.get()

// Get nodes with ids
chain.get({
  id: [<nodeid>, <nodeid>,...]
})

// Reset the chain and the tx db (but keep the wallet db alive)
chain.reset()


chain.count("utxo")               // return utxo count
chain.count("all")                // return all chain node count

# Static methods

Toychain.list()                    // Get all existing toychain metadata
Toychain.get({ id: <id> })        // Get a toychain by id
Toychain.get({ name: <name> })    // Get a toychain by name
Toychain.get({ xpriv: <xpriv> })  // Get a toychain by xpriv

****************************************************************************************/
class Toychain {
  constructor(o) {
    if (!o.storage) o.storage = { path: process.cwd() }
    this.wallet = new Wallet(o)
    this.miner = new Miner(o)
    this.chain = new Chain(this.wallet, this.miner);
    this.tx = new Tx(this.wallet)
  }
  async push(o) {
    await this.tx.push(o)
  }
  get(o) {
    return this.chain.get(o)
  }
  charge(address) {
    Util.charge(address).then(() => {
      console.log("Please charge this address, and then paste the raw transaction into .genesis, and then run the app again")
    })
  }
  count(cmd) {
    return this.chain.count(cmd)
  }
  add(o) {
    if (!o.v) return { error: "please include a 'v' attribute (version)" }
    if (o.v !== 1) return { error: "currently supported version is 1" }
    if (!o.edge) return { error: "please include an 'edge' attribute" }
    if (!o.edge.in) return { error: "please include an 'edge.in' attribute" }
    if (!o.edge.out) return { error: "please include an 'edge.out' attribute" }

    let next = this.chain.next(o, this.wallet)
    if (next.error) {
      return next;
    } else {
      next.out.forEach((node) => {
        this.chain.add(node)
      })
      this.tx.add(next.tx)
      return next;
    }
  }
  clone(o) {
    let tx;
    try {
      if (o.tx) {
        tx = o.tx;
      } else {
        console.log("Must specify either 'tx' or 'file'")
        process.exit()
      }
      this.wallet.add()
      let t = new bsv.Transaction(tx)

      // reject if the transaction already exists
      let exists = this.tx.get({
        id: t.id
      })
      if (exists && exists.length > 0) {
        return { error: "The transaction you are trying to clone already exists on the Toychain" }
      }

      let candidateOutputs = t.outputs.map((o, i) => {
        return {
          address: o.script.toAddress().toString(),
          txid: t.id,
          outputIndex: i,
          script: o.script.toHex(),
          satoshis: o.satoshis
        }
      })

      // filter the candidates to find the output
      // whose address exists in the key db.
      let candidateAddrs = candidateOutputs.map((c) => {
        return c.address
      })

      // Check that the address is part of the HD key tree
      let foundKeys = this.wallet.get({ address: candidateAddrs })
      if (foundKeys && foundKeys.length > 0) {
        // Check that the tx has not been already spent

        /*************************************************
        * if there is no node in the chain,
        *   the id to inject is 0
        * else  
        *   the id to inject is last.id + 1
        *************************************************/
        let last = this.chain.last()
        let injectionId = (last && last.id ? last.id + 1 : 0);
        let utxo = foundKeys.map((key) => {
          let e;
          for (let candidate of candidateOutputs) {
            if (candidate.address === key.address) {
              e = candidate
            }
          }
          return { id: injectionId, tx: t.id, edge: e };
        });
        let a = {
          id: injectionId,
          txid: t.id,
          parent: [],
          edge: utxo[0].edge,
          spent: 0,
        }
        this.chain.add(a)
        this.tx.clone(t)
        return { out: [a], error: null }
      } else {
        return { error: "The transaction being cloned must be sending to an address in the Wallet key tree" }
      }
    } catch (e) {
      return { error: e.toString() }
    }
  }
  reset() {
    this.chain.reset()
    this.tx.reset()
  }
}
module.exports = Toychain
