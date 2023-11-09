# Attendify XRPL API 2.0

Inspired by its predecessor [https://github.com/XRPLBounties/Proof-of-Attendance-API](https://github.com/XRPLBounties/Proof-of-Attendance-API).

## Setup

### Create a Xumm Application

- Login to the Xumm Developer Console [here](https://apps.xumm.dev/)
- Create a new application. Ensure you set the OAuth2 redirect URIs in the `Origin/Redirect URIs` field to specify the location where the frontend app is hosted. This URL must be whitelisted to enable the initiation of the frontend Xumm SDK. Explained in detail [here](https://docs.xumm.dev/environments/identity-oauth2-openid).
  - For a local testing environment that is typically `http://localhost:3000`
  - For a private network it might be something like `http://192.168.1.5:3000` (reachable with mobile devices from a local WLan)
  - In production it might be something like `https://www.poap.io`
- Save the API Key as well as API Secret (later used for `XUMM_API_KEY` and `XUMM_API_SECRET`)

### Configuration

Rename `.env.example` to `.env`, update the values:

- Configure networks (only use websocket URLs, preconfigured default values generally work):
  - `MAINNET_URL`
  - `TESTNET_URL`
  - `DEVNET_URL`
  - `AMM_DEVNET_URL`
- Configure vault wallets (a seed value can be empty, but the backend won't be able to process requests on that network):
  - `MAINNET_VAULT_WALLET_SEED`
  - `TESTNET_VAULT_WALLET_SEED` (create a funded wallet [here](https://xrpl.org/xrp-testnet-faucet.html))
  - `DEVNET_VAULT_WALLET_SEED` (create a funded wallet [here](https://xrpl.org/xrp-testnet-faucet.html))
  - `AMM_DEVNET_VAULT_WALLET_SEED` (create a funded wallet [here](https://xrpl.org/xrp-testnet-faucet.html))
- Configure IFPS provider (one is sufficient):
  - `IPFS_INFURA_ID` and `IPFS_INFURA_SECRET` (create account [here](https://docs.infura.io/infura/getting-started))
  - `IPFS_WEB3_STORAGE_API_TOKEN` (login with github account, see [here](https://web3.storage/login/))
- Configure XUMM App (needs to match the key embedded in the frontend app)
  - `XUMM_API_KEY` and `XUMM_API_SECRET` (create account [here](https://apps.xumm.dev/))
- Configure JSON Web Token (used for server side authentication)
  - `JWT_SECRET` (use something like `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- Configure hashids (used to mask/scramble event IDs)
  - `HASHID_SALT` (use something like `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- Configure event minting/burning
  - `MAX_TICKETS` (between 2 and 250, see [here](https://xrpl.org/tickets.html#limitations))
  - `MAX_EVENT_SLOTS` (maximum number of allowed participants per event)

> **Important:** You can verify the correctness of your `.env` variables configuration with `yarn run check`.

### Reserve Requirements

A platform (vault wallet) account needs a minimum balance of **62 XRP** to function correctly:

- 10 XRP base reserve (account activation)
- 50 XRP owner reserve for tickets, used for batch minting/burning (configurable, should be at least `2 * MAX_TICKETS`)
- 2 XRP as a safety buffer

### Run

- Install dependencies with `yarn install`
- Run the server api with `yarn run start`
- Run the daemon with `yarn run start:daemon` in a separate terminal

## Administration

Users with admin permissions have the capability to monitor and manage the platform through the frontend:

- View curent vault account balances and reserve requirements
- List all events hosted on the platform
- List active organizers on the platform
- Cancel active events

> **Note:** It is advisable to configure at least one admin account.

### Manage Admins

Any platform user can be given admin privileges.
Use the `yarn run console admin` script to add or remove the admin account flag in the database.

Examples:

```sh
yarn run console admin --help
yarn run console admin add r3drY2fHEEzFiU1EHpw2Qjpa2EHGs8cMHo
yarn run console admin add r3drY2fHEEzFiU1EHpw2Qjpa2EHGs8cMHo true
yarn run console admin remove r3drY2fHEEzFiU1EHpw2Qjpa2EHGs8cMHo
```

## Notable Features

- Typescript project
- Full support for the Xaman (Xumm) and Gem wallet
- Support for any network (e.g. Testnet)
- Data is stored in a database (with orm), available models:
  - `User`
  - `Event`
  - `Accounting`
  - `NFT`
  - `Claim`
- Strict request data validation
- Server side jwt based authentication
- API endpoints:
  - GET `/event/minter` - fetch authorized minter info
  - POST `/event/create` - create a new event
  - POST `/event/cancel` - cancel an event
  - POST `/event/join` - join an existing event
  - POST `/event/claim` - claim NFT for an event
  - POST `/event/invite` - add new participants to an event
  - GET `/event/info/:id` - fetch details about one event
  - GET `/event/link/:id` - fetch a masked invitation link for an event
  - GET `/events/all` - fetch a list of all events
  - GET `/events/owned` - fetch a list of user owned events
  - GET `/ownership/verify/` - verify NFT ownership for an event
  - GET `/offers` - fetch a list of NFT offers
  - GET `/user/info` - fetch details about a user
  - POST `/user/update` - update user profile
  - GET `/users/lookup` - fetch a list of all user wallet addresses on the platform
  - GET `/users/organizers` - fetch a list of all organizers on the platform
  - GET `/auth/heartbeat` - check if backend service is available
  - POST `/auth/nonce` - request a login nonce
  - POST `/auth/login` - login, request jwt
  - POST `/auth/refresh` - refresh jwt
  - POST `/payment/check` - verify an event deposit transaction
  - GET `/admin/stats` - fetch platform usage statistics
- Support for alternative IPFS provider (web3.storage)
- Many more overall code improvements

## Documentation

Full API reference and module documentation is available [here](https://rikublock.github.io/POAP-API2/).
