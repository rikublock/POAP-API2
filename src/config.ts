import type { Options as SequelizeOptions } from "sequelize";
import "dotenv/config";

import { NetworkIdentifier, NetworkConfig } from "./types";

type ConfigAttendify = {
  db: SequelizeOptions;
  networkConfigs: NetworkConfig[];
  ipfs: {
    infuraId: string;
    infuraSecret: string;
    web3StorageToken: string;
  };
  maxTickets: number;
};

type ConfigServer = {
  port: number;
  xummApiKey: string;
  xummApiSecret: string;
  jwtSecret: string;
  hashidSalt: string;
  hashidLength: number;
  maxEventSlots: number;
};

export type Config = {
  isTesting: boolean;
  attendify: ConfigAttendify;
  server: ConfigServer;
};

const isTesting = process.env.NODE_ENV === "test";

const DEFAULT: Config = {
  isTesting: isTesting,
  attendify: {
    db: {
      dialect: "sqlite",
      storage: "backend.sqlite3",
      logging: false,
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
    ipfs: {
      infuraId: process.env.IPFS_INFURA_ID as string,
      infuraSecret: process.env.IPFS_INFURA_SECRET as string,
      web3StorageToken: process.env.IPFS_WEB3_STORAGE_API_TOKEN as string,
    },
    maxTickets: parseInt(process.env.MAX_TICKETS as string),
  },
  server: {
    port: 4000,
    xummApiKey: process.env.XUMM_API_KEY as string,
    xummApiSecret: process.env.XUMM_API_SECRET as string,
    jwtSecret: process.env.JWT_SECRET as string,
    hashidSalt: process.env.HASHID_SALT as string,
    hashidLength: 8,
    maxEventSlots: parseInt(process.env.MAX_EVENT_SLOTS as string),
  },
};

const CI: Config = {
  isTesting: isTesting,
  attendify: {
    db: {
      dialect: "sqlite",
      storage: ":memory:",
      logging: false,
      define: {
        timestamps: false,
      },
    },
    networkConfigs: [
      {
        networkId: NetworkIdentifier.TESTNET,
        url: "wss://s.altnet.rippletest.net:51233/",
        vaultWalletSeed: "sEd7a9r3UWGLSV6HkKmF3xiCTTi7UHw", // rDnAPDiJk1P4Roh6x7x2eiHsvbbeKtPm3j
      },
    ],
    ipfs: {
      infuraId: "",
      infuraSecret: "",
      web3StorageToken: process.env.IPFS_WEB3_STORAGE_API_TOKEN as string,
    },
    maxTickets: 5,
  },
  server: {
    port: 4000,
    xummApiKey: process.env.XUMM_API_KEY as string,
    xummApiSecret: process.env.XUMM_API_SECRET as string,
    jwtSecret: "ac958f151a3db2f3e0f65563eeca98cc1f5966452c4664c5063b6ef90b082513",
    hashidSalt: "cdfcb55e2f120f20b8b79d981e4b061a40f691d54005e2c057afd49dea392eb5",
    hashidLength: 2,
    maxEventSlots: 200,
  },
};

const config: Config = isTesting ? CI : DEFAULT;

export default config;
