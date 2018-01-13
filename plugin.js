const express = require('express')
const Web3 = require('web3')
const Machinomy = require('machinomy').default
const Payment = require('machinomy/lib/payment').default
const bodyParser = require('body-parser')
const ganache = require('ganache-cli')
const promisify = require('util').promisify
const fetch = require('node-fetch')
const debug = require('debug')('ilp-plugin-ethereum-paychan')

const DEFAULT_PROVIDER_URI = 'http://localhost:8545'

class PluginEthereumPaychan {
  constructor ({ port, server, provider, account, db }) {
    this.port = port
    this.server = server
    this.account = account || ''
    this.peerAccount = ''
    this.db = db || 'machinomy_db'

    if (typeof provider === 'string') {
      this.provider = new Web3.providers.HttpProvider(provider)
    } else if (provider) {
      this.provider = provider
    } else {
      this.provider = new Web3.providers.HttpProvider(DEFAULT_PROVIDER_URI)
    }
    this.web3 = new Web3(this.provider)

    this.machinomy = null
    this.moneyHandler = () => Promise.resolve()
    this.dataHandler = () => Promise.resolve(Buffer.alloc(0))
  }

  async connect () {
    debug('connecting')
    if (!this.account) {
      const accounts = await promisify(web3.eth.getAccounts)()
      if (accounts.length === 0) {
        throw new Error('Provider has no accounts registered')
      }
      this.account = accounts[0]
    }
    this.machinomy = new Machinomy(this.account, this.web3, { engine: 'nedb', databaseFile: this.db })

    if (this.server) {
      debug('attempting to connect to peer')
      const result = await fetch(this.server)
      if (!result.ok) {
        throw new Error('Unable to reach peer server')
      }
      const body = await result.json()
      this.peerAccount = body.account
      debug('connected to peer')
    }

    if (this.port) {
      // TODO switch to koa
      const listener = express()

      listener.get('/', (req, res) => {
        debug('got connection from:', req.ip)
        res.send({
          account: this.account
        })
        res.status(200)
        res.end()
      })

      listener.post('/money', bodyParser.json(), async (req, res, next) => {
        const payment = new Payment(req.body)
        debug('got payment:', payment)
        const token = await this.machinomy.acceptPayment(payment)
        await this.moneyHandler('' + payment.price)
        res.header('Paywall-Token', token)
        res.status(200)
        res.end()
      })

      listener.post('/data', bodyParser.raw(), async (req, res, next) => {
        debug('got data:', req.body.toString('hex'))
        const response = await this.dataHandler(req.body)
        res.send(response)
        res.end()
      })

      listener.listen(this.port)

      this.listener = listener
      debug('listening on port:', this.port)
    }

    debug('connected')
  }

  async disconnect () {
    debug('disconnect')
    // Stop accepting data and money
    this.listener.close()

    // Close existing channels
    for (let channel of await this.machinomy.channels()) {
      try {
        await machinomy.close(channel.channelId)
        debug('closed channel:', channel.channelId)
      } catch (err) {
        console.error('error closing channel:', channel.channelId)
      }
    }
  }

  async sendData (data) {
    debug('sending data:', data.toString('hex'))
    const result = await fetch(this.server + '/data', {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    })
    const resultBuffer = await result.buffer()
    debug('got response:', resultBuffer.toString('hex'))
    return resultBuffer
  }

  async sendMoney (amount) {
    debug('sending money:', amount)
    await this.machinomy.buy({
      price: Number(amount),
      gateway: this.server + '/money',
      receiver: this.peerAccount,
      meta: ''
    })
  }

  registerDataHandler (handler) {
    this.dataHandler = handler
  }

  deregisterDataHandler () {
    this.dataHandler = () => Promise.resolve(Buffer.alloc(0))
  }

  registerMoneyHandler (handler) {
    this.moneyHandler = handler
  }

  deregisterDataHandler () {
    this.moneyHandler = () => Promise.resolve()
  }
}
PluginEthereumPaychan.version = 2

async function main () {
  const provider = new Web3.providers.HttpProvider(DEFAULT_PROVIDER_URI)
  const web3 = new Web3(provider)
  const accounts = await promisify(web3.eth.getAccounts)()
  const senderAccount = accounts[0]
  const receiverAccount = accounts[1]

  const sender = new PluginEthereumPaychan({
    account: senderAccount,
    server: 'http://localhost:3000',
    db: 'sender_db'
  })
  const receiver = new PluginEthereumPaychan({
    account: receiverAccount,
    port: 3000,
    db: 'receiver_db'
  })
  receiver.registerDataHandler((buffer) => Promise.resolve(Buffer.alloc(32, 255)))
  receiver.registerMoneyHandler((amount) => console.log('receiver got:', amount))

  await receiver.connect()
  await sender.connect()

  const response = await sender.sendData(Buffer.alloc(32, 0))
  console.log('receiver responded:', response.toString('hex'))
  await sender.sendMoney(1)

  process.exit(0)
}

main().catch(err => console.log(err))
