# Reserve Fork

This is the Reserve fork of the Kyber smart-contracts project, used to deploy RSR and RSV Automated Price Reserves. See `web3deployments/rsrReserve_input.json` and `web3deployments/rsvReserve_input.json`.

For information on how to work with our Kyber Reserves, go [here](https://developer.kyber.network/docs/Reserves-AutomatedPriceReserve/)

---

Begin Kyber README

## Introduction

This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## Setup

1. Clone this repo
2. `npm ci`

## Compilation with Buidler

`./compilation.sh`

## Testing full contract suite with Buidler

1. If contracts have not been compiled, run `./compilation.sh`. This step can be skipped subsequently.
2. Run `./tst.sh`
3. Use `-f` for running a specific test file.
4. Use `-k` to specify a specific hardfork version. Runs on Petersburg by default.

### Example Commands

`./tst.sh -f "./test/kyberReserve.js"`
`./tst.sh -f "./test/kyberNetworkProxy.js" -k "istanbul"`

### Example

`npx buidler test --no-compile ./test/kyberNetwork.js`
