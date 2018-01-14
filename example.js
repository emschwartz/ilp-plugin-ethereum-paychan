const PluginEthereumPaychan = require('./plugin')

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

  await receiver.disconnect()
  await sender.disconnect()
  process.exit(0)
}

main().catch(err => console.log(err))
