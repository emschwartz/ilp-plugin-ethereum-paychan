'use strict'

const express = require('express')
const Web3 = require('web3')
const Machinomy = require('machinomy').default
const Payment = require('machinomy/lib/payment').default
const bodyParser = require('body-parser')
const promisify = require('util').promisify
const fetch = require('node-fetch')
const debug = require('debug')('ilp-plugin-ethereum-paychan')

const DEFAULT_PROVIDER_URI = 'http://localhost:8545'

class PluginEthereumPaychan {
  constructor ({ port, server, provider, account, db, minimumChannelAmount }) {
    this.port = port
    this.server = server
    this.account = account || ''
    this.peerAccount = ''
    this.db = db || 'machinomy_db'
    this.minimumChannelAmount = (typeof minimumChannelAmount === 'number' ? minimumChannelAmount : 100)

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
    this.machinomy = new Machinomy(this.account, this.web3, {
      engine: 'nedb',
      databaseFile: this.db,
      minimumChannelAmount: this.minimumChannelAmount
    })

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

    // Make sure there is an open channel to the receiver so that we don't have to wait when we want to send payments
    // Based on suggestion in https://github.com/machinomy/machinomy/issues/123#issuecomment-357537398
    if (this.server) {
      await this.machinomy.buy({
        price: 0,
        gateway: this.server + '/money',
        receiver: this.peerAccount,
        meta: ''
      })
    }

    if (this.port) {
      // TODO switch to koa or plain http(s) server
      const app = express()

      app.get('/', (req, res) => {
        debug('got connection from:', req.ip)
        res.send({
          account: this.account
        })
        res.status(200)
        res.end()
      })

      app.post('/money', bodyParser.json(), async (req, res, next) => {
        const payment = new Payment(req.body)
        debug('got payment:', payment)
        const token = await this.machinomy.acceptPayment(payment)
        if (payment.price > 0) {
          await this.moneyHandler('' + payment.price)
        }
        res.header('Paywall-Token', token)
        res.status(200)
        res.end()
      })

      app.post('/data', bodyParser.raw(), async (req, res, next) => {
        debug('got data:', req.body.toString('hex'))
        const response = await this.dataHandler(req.body)
        res.send(response)
        res.end()
      })

      this.listener = app.listen(this.port)
      debug('listening on port:', this.port)
    }

    debug('connected')
  }

  async disconnect () {
    debug('disconnect')
    // Stop accepting data and money
    if (this.listener) {
      this.listener.close()
    }

    // Close existing channels
    for (let channel of await this.machinomy.channels()) {
      try {
        await this.machinomy.close(channel.channelId)
        debug('closed channel:', channel.channelId)
      } catch (err) {
        console.error('error closing channel:', channel.channelId, err)
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
    return
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

// TODO use es6 modules style export?
module.exports = PluginEthereumPaychan

