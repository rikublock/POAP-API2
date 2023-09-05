export enum NetworkIdentifier {
  UNKNOWN,
  MAINNET,
  TESTNET,
  DEVNET,
  AMM_DEVNET,
}

export enum WalletType {
  XUMM_WALLET,
  GEM_WALLET,
}

export enum EventStatus {
  PENDING,
  PAID,
  ACTIVE,
  CLOSED,
  CANCELED,
}

export type NetworkConfig = {
  networkId: NetworkIdentifier;
  url: string;
  vaultWalletSeed: string;
};

export type Metadata = {
  title: string;
  description: string;
  location: string;
  imageUrl: string;
  tokenCount: number;
  dateStart: Date;
  dateEnd: Date;
};

export type PlatformStats = {
  users: {
    total: number;
    organizers: number;
    admins: number,
  };
  events: {
    total: number;
    pending: number;
    active: number;
    finished: number;
  };
  account: {
    balance: string;
    reserve: string;
  };
};
