# `ilp-plugin-ethereum-paychan`
> Interledger V2 Ledger Plugin for Ether and ERC20 Tokens

**WARNING:** This code has not been reviewed or tested, **DO NOT USE IT WITH REAL MONEY**.

This plugin enables Interledger payments to be sent over Ethereum payment channels. It is a minimal wrapper around [Machinomy's](https://machinomy.com) payment channel implementation for Ether and ERC20 tokens and uses HTTP(S) for communication between peers.

## Installation

### Prerequisites

1. Local Ethereum provider ([Parity](https://www.parity.io/), [geth](https://geth.ethereum.org/), or [Ganache CLI](https://github.com/trufflesuite/ganache-cli) for local development)
2. Machinomy smart contracts deployed to the Ethereum network (they are already deployed to the [Ropsten](https://github.com/ethereum/ropsten) testnet but you can follow the guide [here](https://github.com/machinomy/machinomy-contracts) to deploy them to a local network)

### Getting the Plugin

```shell
npm install --save https://github.com/emschwartz/ilp-plugin-ethereum-paychan.git
```

(Sorry, it's not on NPM yet)

## Usage

See [example.js](./example.js)

