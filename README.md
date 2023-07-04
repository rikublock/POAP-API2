# Attendify XRPL API 2.0

Inspired by its predecessor [https://github.com/XRPLBounties/Proof-of-Attendance-API](https://github.com/XRPLBounties/Proof-of-Attendance-API).

## Getting Started
- install dependencies with `yarn install`
- rename `.env.example` to `.env`, update the values:
  - configure networks (only use websocket URLs, default values generally work):
    - `MAINNET_URL`
    - `TESTNET_URL`
    - `DEVNET_URL`
    - `AMM_DEVNET_URL`
  - configure vault wallets (a seed value can be empty, but the backend won't be able to process requests on that network):
    - `MAINNET_VAULT_WALLET_SEED`
    - `TESTNET_VAULT_WALLET_SEED` (create a funded wallet [here](https://xrpl.org/xrp-testnet-faucet.html))
    - `DEVNET_VAULT_WALLET_SEED` (create a funded wallet [here](https://xrpl.org/xrp-testnet-faucet.html))
    - `AMM_DEVNET_VAULT_WALLET_SEED` (create a funded wallet [here](https://xrpl.org/xrp-testnet-faucet.html))
  - configure IFPS provider (one is sufficient):
    - `INFURA_ID` and `INFURA_SECRET` (create account [here](https://docs.infura.io/infura/getting-started))
    - `WEB3_STORAGE_API_TOKEN` (login with github account, see [here](https://web3.storage/login/))
  - configure XUMM App (needs to match the key embedded in the frontend App)
    - `XUMM_API_KEY` and `XUMM_API_SECRET` (create account [here](https://apps.xumm.dev/), make sure to set the origin URIs, e.g. `http://localhost:3000`)
  - configure JWT
    - `JWT_SECRET` (use something like `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- run the app with `yarn start`


## Notable Changes

- Typescript project
- full support for the Xumm and Gem walllets
- support for any network (e.g. Testnet)
- data is stored in a database (with orm), available models:
  - `User`
  - `Event`
  - `NFT`
  - `Claim`
- strict request data validation
- server side jwt based authentication
- new API endpoints:
  - POST `/event/create` - create a new event
  - POST `/event/join` - join an existing event
  - POST `/event/claim` - claim NFT for an event
  - POST `/event/invite` - add new participants to an event
  - GET `/event/info/:id` - fetch details about one event
  - GET `/events/public` - fetch a list of public events
  - GET `/events/owned` - fetch a list of user owned events
  - GET `/offers` - fetch a list of NFT offers
  - GET `/user/info` - fetch details about a user
  - POST `/user/update` - update user profile
  - GET `/auth/heartbeat` - check if backend service is available 
  - POST `/auth/nonce` - request a login nonce
  - POST `/auth/login` - login, request jwt 
  - POST `/auth/refresh` - refresh jwt
- support for alternative IPFS provider (web3.storage)
- many more overall code improvements

## Documentation 

Full API and module documentation is available [here](https://rikublock.github.io/POAP-API2/).
