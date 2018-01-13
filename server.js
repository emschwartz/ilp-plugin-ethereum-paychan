const express = require('express')
const Web3 = require('web3')
const Machinomy = require('machinomy').default
const Payment = require('machinomy/lib/payment').default
const bodyParser = require('body-parser')
const ganache = require('ganache-cli')
const promisify = require('util').promisify
const fetch = require('node-fetch')

async function main () {
  const provider = new Web3.providers.HttpProvider('http://localhost:8545')
  const web3 = new Web3(provider)
  const accounts = await promisify(web3.eth.getAccounts)()
  const sender = accounts[0]
  const receiver = accounts[1]

    /**
     * Create machinomy instance that provides API for accepting payments.
     */
  let machinomy = new Machinomy(receiver, web3, { engine: 'nedb' })

  let hub = express()
  hub.use(bodyParser.json())
  hub.use(bodyParser.urlencoded({ extended: false }))

    /**
     * Recieve an off-chain payment issued by `machinomy buy` command.
     */
  hub.post('/machinomy', async (req, res, next) => {
    let payment = new Payment(req.body)
    console.log('got payment', payment)
    let token = await machinomy.acceptPayment(payment)
    console.log('sending token', token)
    res.status(202).header('Paywall-Token', token).send('Accepted').end()
  })

    /**
     * Verify the token that `/machinomy` generates.
     */
  hub.get('/verify/:token', async (req, res, next) => {
    let token = req.params.token
    let isOk = false
    isOk = await machinomy.verifyToken(token)
    if (isOk) {
      res.status(200).send({ status: 'ok' })
    } else {
      res.status(500).send({ status: 'token is invalid' })
    }
  })

  hub.get('/claim/:channelid', async (req, res, next) => {
    try {
      let channelId = req.params.channelid
      await machinomy.close(channelId)
      res.status(200).send('Claimed')
    } catch (error) {
      res.status(404).send('No channel found')
      console.log(error)
    }
  })

  let port = 3001
  await hub.listen(port, function () {
    console.log('HUB is ready on port ' + port)
  })

  let app = express()
  let paywallHeaders = () => {
    let headers = {}
    headers['Paywall-Version'] = '0.0.3'
    headers['Paywall-Price'] = '0.1'
    headers['Paywall-Address'] = receiver
    headers['Paywall-Gateway'] = 'http://localhost:3001/machinomy'
    return headers
  }

    /**
     * Example of serving a paid content. You can buy it with `machinomy buy http://localhost:3000/content` command.
     */
  app.get('/content', async (req, res, next) => {
    let reqUrl = 'http://localhost:3001/verify'
    let content = req.get('authorization')
    if (content) {
      let token = content.split(' ')[1]
      let response = await fetch(reqUrl + '/' + token)
      let json = await response.json()
      let status = json.status
      if (status === 'ok') {
        res.send('Thank you for your purchase')
      } else {
        res.status(402).set(paywallHeaders()).send('Content is not avaible')
      }
    } else {
      res.status(402).set(paywallHeaders()).send('Content is not avaible')
    }
  })

  let portApp = 3000
  app.listen(portApp, function () {
    console.log('Content proveder is ready on ' + portApp)
  })

  const client = new Machinomy(sender, web3, { engine: 'nedb', databaseFile: 'machinomy_client' })

  const response = await fetch('http://localhost:3000/content')
  console.log(response.headers)

  const result = await client.buy({
    price: 1,
    gateway: 'http://localhost:3001/machinomy',
    receiver: receiver,
    meta: 'blah'
  })

  const receiverChannels = await machinomy.channels()
  for (let c of receiverChannels) {
    await machinomy.close(c.channelId)
  }
  process.exit(0)
}

main().catch(err => console.log(err))
