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

/**
 * Event Status Codes
 * - PENDING: successfully created database entry, awaiting payment
 * - PAID: received and confirmed deposit payment, awaiting NFT mint (by daemon)
 * - ACTIVE: successfully minted NFTs, everything is ready to be claimed
 * - CANCELED: initiated cancellation, awaiting NFT burn (by daemon)
 * - CLOSED: successfully burnt remaining NFTs, ready to refund deposit (by daemon)
 * - REFUNDED: successfully refunded deposit
 */
export enum EventStatus {
  PENDING,
  PAID,
  ACTIVE,
  CANCELED,
  CLOSED,
  REFUNDED,
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
