/******************************************************************************

A primitive Toychain graph explorer. Run it after you've populated a Toychain

******************************************************************************/
const express = require('express')
const Toychain = require('../index')
const chain = new Toychain({
  xpriv: "xprv9s21ZrQH143K4WqdoZtETcEoUnSCmaMQdDpCjoRHC4AX5eRg4BcQuxzQMeAWk9N2VRPDJVeSdtNpPdJnkwEfrYVAjNnmN9aW6ZbERL8JAKU"
})
const JSONStream = require("JSONStream")
const bsv = require('bsv')
const app = express()
const port = 3012
app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + "/public/index.html")
})
app.get('/charge', (req, res) => {
  res.sendFile(__dirname + "/public/button.html")
})
app.get('/db', async (req, res) => {
  let result = chain.get()
  for (let r of result) {
    r.edge = JSON.parse(r.edge)
    r.parent = JSON.parse(r.parent)
  }
  res.json(result)
})
app.listen(port)
