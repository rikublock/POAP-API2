# Attendify XRPL API 2.0

Inspired by its predecessor [https://github.com/XRPLBounties/Proof-of-Attendance-API](https://github.com/XRPLBounties/Proof-of-Attendance-API).

## Setup

### Configuration 

- rename `.env.example` to `.env`, update the values:
  - configure networks (only use websocket URLs, preconfigured default values generally work):
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
    - `IPFS_INFURA_ID` and `IPFS_INFURA_SECRET` (create account [here](https://docs.infura.io/infura/getting-started))
    - `IPFS_WEB3_STORAGE_API_TOKEN` (login with github account, see [here](https://web3.storage/login/))
  - configure XUMM App (needs to match the key embedded in the front end app)
    - `XUMM_API_KEY` and `XUMM_API_SECRET` (create account [here](https://apps.xumm.dev/))
    - **Important:** Make sure to set the origin URIs, e.g. `http://localhost:3000` (URI the front end app is running on)
  - configure JWT
    - `JWT_SECRET` (use something like `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
  - configure hashids
    - `HASHID_SALT` (use something like `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
  - configure minting 
    - `MAX_TICKETS` (between 2 and 250, see [here](https://xrpl.org/tickets.html#limitations))
    - `MAX_EVENT_SLOTS`

### Run
- install dependencies with `yarn install`
- run the server api with `yarn start`
- run the daemon with `yarn start:daemon` in a separate terminal

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
  - GET `/event/minter` - fetch authorized minter info
  - POST `/event/create` - create a new event
  - POST `/event/join` - join an existing event
  - POST `/event/claim` - claim NFT for an event
  - POST `/event/invite` - add new participants to an event
  - GET `/event/info/:id` - fetch details about one event
  - GET `/event/link/:id` - fetch a masked invitation link for an event
  - GET `/events/public` - fetch a list of public events
  - GET `/events/owned` - fetch a list of user owned events
  - GET `/offers` - fetch a list of NFT offers
  - GET `/user/info` - fetch details about a user
  - POST `/user/update` - update user profile
  - GET `/user/slots` - fetch event slot details of a user
  - GET `/users` - fetch a list of all users on the platform
  - GET `/auth/heartbeat` - check if backend service is available 
  - POST `/auth/nonce` - request a login nonce
  - POST `/auth/login` - login, request jwt 
  - POST `/auth/refresh` - refresh jwt
  - GET `/admin/stats` - fetch platform usage statistics
- support for alternative IPFS provider (web3.storage)
- many more overall code improvements

## Reserve Requirements 

A platform (vault wallet) account needs a minimum balance of 520 XRP to function correctly:
- 10 XRP base reserve (account activation)
- 500 XRP owner reserve for tickets (used for batch minting)
- 10 XRP to cover ongoing transaction fees

## Manage Admins

Use the `yarn run console admin` script to add or remove the admin account flag in the database.

Examples:
```sh
yarn run console admin --help
yarn run console admin add r3drY2fHEEzFiU1EHpw2Qjpa2EHGs8cMHo
yarn run console admin add r3drY2fHEEzFiU1EHpw2Qjpa2EHGs8cMHo true
yarn run console admin remove r3drY2fHEEzFiU1EHpw2Qjpa2EHGs8cMHo
```

## Documentation 

Full API and module documentation is available [here](https://rikublock.github.io/POAP-API2/).
