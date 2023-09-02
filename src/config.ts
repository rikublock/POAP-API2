import type { Options as SequelizeOptions } from "sequelize";
import "dotenv/config";

import { NetworkIdentifier, NetworkConfig } from "./types";

type ConfigAttendify = {
  db: SequelizeOptions;
  networkConfigs: NetworkConfig[];
};

type ConfigServer = {
  port: number;
  xummApiKey: string;
  xummApiSecret: string;
  jwtSecret: string;
  hashidSalt: string;
  hashidLength: number;
  ipfs: {
    infuraId: string;
    infuraSecret: string;
    web3StorageToken: string;
  };
};

export type Config = {
  isTesting: boolean;
  attendify: ConfigAttendify;
  server: ConfigServer;
};

const DEFAULT: Config = {
  isTesting: process.env.NODE_ENV === "test",
  attendify: {
    db: {
      dialect: "sqlite",
      storage: "backend.sqlite3",
      logging: true,
      define: {
        timestamps: false,
      },
    },

    networkConfigs: [
      {
        networkId: NetworkIdentifier.MAINNET,
        url: process.env.MAINNET_URL as string,
        vaultWalletSeed: process.env.MAINNET_VAULT_WALLET_SEED as string,
      },
      {
        networkId: NetworkIdentifier.TESTNET,
        url: process.env.TESTNET_URL as string,
        vaultWalletSeed: process.env.TESTNET_VAULT_WALLET_SEED as string,
      },
      {
        networkId: NetworkIdentifier.DEVNET,
        url: process.env.DEVNET_URL as string,
        vaultWalletSeed: process.env.DEVNET_VAULT_WALLET_SEED as string,
      },
      {
        networkId: NetworkIdentifier.AMM_DEVNET,
        url: process.env.AMM_DEVNET_URL as string,
        vaultWalletSeed: process.env.AMM_DEVNET_VAULT_WALLET_SEED as string,
      },
    ],
  },
  server: {
    port: 4000,
    xummApiKey: process.env.XUMM_API_KEY as string,
    xummApiSecret: process.env.XUMM_API_SECRET as string,
    jwtSecret: process.env.JWT_SECRET as string,
    hashidSalt: process.env.HASHID_SALT as string,
    hashidLength: 2,
    ipfs: {
      infuraId: process.env.IPFS_INFURA_ID as string,
      infuraSecret: process.env.IPFS_INFURA_SECRET as string,
      web3StorageToken: process.env.IPFS_WEB3_STORAGE_API_TOKEN as string,
    },
  },
};

export const config: Config = DEFAULT;

export default config;
