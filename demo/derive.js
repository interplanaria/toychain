/*************************************************************************

Specify a derive algorithm (Look inside the Toychain consturctor

**************************************************************************/
const bsv = require('bsv')
const Toychain = require('../index')
const chain = new Toychain({
  xpriv: "xprv9s21ZrQH143K2BNpmutpdbu7WUjKdL6KNuLQamddf1ukjoGSAPc92vbFQbZmXX23pDiVjQ2qoXQukSnjS8XQh3a6Rmsiruf1CdiPwPoTj1z",
  derive: (o) => {
    return o.root + "/" + o.i
  }
})
chain.clone({
  tx: "0100000001bcec45c9eec55c91eec810e2754b3b7bbd7639a580b5031782bcc0f7638ee679010000006b483045022100eb9617648fbc8fc69d5a51a32b3cab9bdfe6d43cd119f1e12040dd8b14bf82aa02201ce55567e92b0c68805379e5ca64cbf00a883d738a0f4cf49ddd9f34c36c44ef412103009814ad109c3fbb9e000ec7f40337d2ddb344e329bb2525baee38bf3853d934ffffffff0259d50000000000001976a914fcbd33b926ea585916ccdc1221a601efdc038a8f88accadd4a00000000001976a9141f014c95b714ed61b2362cc7255a621985a9325c88ac00000000"
})
let smile = "🤡"
let stub = {
  v: 1,
  out: [{ "o0": "OP_0", "o1": "OP_RETURN", "s2": "toychain", "s3": "letsago" }],
  edge: { in: 1, out: 2 }
}
for(let i=0; i<50; i++) {
  stub.out[0].s3 = i.toString()
  stub.out[0].s4 = smile.repeat((i+1)%100)
  let result = chain.add(stub)
  console.log("RESULT = ", result)
  if (!result) {
    let utxo = chain.count("utxo")
    console.log("utxo count = ", utxo)
    if (utxo <= 1) {
      console.log("Ran out of balance")
      process.exit()
    } else {
      stub.edge.in = 2;
      stub.edge.out = 1;
    }
  } else {
    stub.edge.in = 1;
    stub.edge.out = 2;
  }
}
console.log("chain size = ", chain.chain.size())
console.log("tx size = ", chain.tx.size())
console.log("wallet size = ", chain.wallet.size())

//console.log("resetting")
//chain.reset()
//console.log("chain size = ", chain.chain.size())
//console.log("tx size = ", chain.chain.size())
//console.log("wallet size = ", chain.wallet.size())
//console.log("wallet = ", chain.wallet)
