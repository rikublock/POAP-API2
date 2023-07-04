import { NetworkIdentifier, NetworkConfig } from "./types";
import "dotenv/config";

type ConfigAttendify = {
  networkConfigs: NetworkConfig[];
};

type ConfigServer = {
  port: number;
  xummApiKey: string;
  xummApiSecret: string;
  jwtSecret: string;
  ipfs: {
    infuraId: string;
    infuraSecret: string;
    web3StorageToken: string;
  };
};

export type Config = {
  attendify: ConfigAttendify;
  server: ConfigServer;
};

const DEFAULT: Config = {
  attendify: {
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
        url: process.env.AMM_DEVNET_URL!,
        vaultWalletSeed: process.env.AMM_DEVNET_VAULT_WALLET_SEED as string,
      },
    ],
  },

  server: {
    port: 4000,
    xummApiKey: process.env.XUMM_API_KEY as string,
    xummApiSecret: process.env.XUMM_API_SECRET as string,
    jwtSecret: process.env.JWT_SECRET as string,
    ipfs: {
      infuraId: process.env.IPFS_INFURA_ID as string,
      infuraSecret: process.env.IPFS_INFURA_SECRET as string,
      web3StorageToken: process.env.IPFS_WEB3_STORAGE_API_TOKEN as string,
    },
  },
};

export const config: Config = DEFAULT;

export default config;