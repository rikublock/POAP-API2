import assert from "node:assert/strict";

import {
  AccountNFTsResponse,
  AccountObjectsResponse,
  Client,
  convertStringToHex,
  isValidSecret,
  LedgerEntry,
  NFTokenBurn,
  NFTokenCreateOffer,
  NFTokenCreateOfferFlags,
  NFTokenMint,
  Payment,
  RippledError,
  TicketCreate,
  TransactionMetadata,
  TxResponse,
  Wallet,
  xrpToDrops,
} from "xrpl";
import type { CreatedNode } from "xrpl/dist/npm/models/transactions/metadata";
import { Op } from "sequelize";

import { AttendifyError } from "./error";
import { db, orm } from "./models";
import { postToIPFS } from "./ipfs";
import {
  Metadata,
  NetworkIdentifier,
  NetworkConfig,
  EventStatus,
  PlatformStats,
} from "../types";

// tx fee deposit requirement for an event
export const DEPOSIT_FEE = BigInt(xrpToDrops(1));

// default tx fee in case an exact value is unknown
export const FALLBACK_TX_FEE = 100n;

// xrp ledger limitation, see https://xrpl.org/tickets.html#limitations
const MAX_ALLOWED_TICKETS = 250;

/**
 * Attendify is an utility library for the Proof of Attendance infrastructure on the XRPL.
 */
export class Attendify {
  private ready: boolean;
  private nextEventId: number;
  private networkConfigs: NetworkConfig[];
  private maxTickets: number;

  constructor(
    networkConfigs: NetworkConfig[],
    maxTickets: number,
    nextEventId: number = 0
  ) {
    this.ready = false;
    this.nextEventId = nextEventId;
    this.networkConfigs = networkConfigs;
    this.maxTickets = maxTickets;
  }

  /**
   * Initializes a new instance of the Attendify class.
   * This MUST be called before using the library.
   */
  async init() {
    // init database
    await db.authenticate();
    await db.sync({ force: false });

    await db.transaction(async (t) => {
      // determine next event id
      const event = await orm.Event.findOne({
        order: [["id", "DESC"]],
        transaction: t,
      });
      if (event) {
        this.nextEventId = event.id + 1;
      } else {
        this.nextEventId = 1;
      }

      // ensure seed wallet users exist
      for (const config of this.networkConfigs) {
        if (isValidSecret(config.vaultWalletSeed)) {
          const wallet = Wallet.fromSeed(config.vaultWalletSeed);
          await orm.User.findOrCreate({
            where: { walletAddress: wallet.classicAddress },
            defaults: {
              walletAddress: wallet.classicAddress,
              isOrganizer: false,
              isAdmin: false,
            },
            transaction: t,
          });
        }
      }
    });

    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get the configuration for a specific network
   * @param networkId - network identifier
   * @returns fresh wallet and client instance for a network
   */
  getNetworkConfig(networkId: NetworkIdentifier): [Client, Wallet] {
    const config = this.networkConfigs.find((obj: NetworkConfig) => {
      return obj.networkId === networkId;
    });

    if (!config || !isValidSecret(config.vaultWalletSeed)) {
      throw new AttendifyError("Network not supported");
    }
    return [new Client(config.url), Wallet.fromSeed(config.vaultWalletSeed)];
  }

  /**
   * Check if an account exists on a particular network
   * @param networkId - network identifier
   * @param walletAddress - account wallet address
   * @returns  true, if the ledger account exists
   */
  async checkAccountExists(
    networkId: NetworkIdentifier,
    walletAddress: string
  ): Promise<boolean> {
    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      console.debug(`Checking existence of account '${walletAddress}'`);
      await client.request({
        command: "account_info",
        account: walletAddress,
        ledger_index: "validated",
      });
      return true;
    } catch (err) {
      if (err instanceof RippledError) {
        // error: Account not found
        if ((err.data as any)?.error_code === 19) {
          return false;
        }
      }
      throw err;
    } finally {
      await client.disconnect();
    }
  }

  /**
   * Check if an account has set the platform as authorized minter
   * @param networkId - network identifier
   * @param walletAddress - account wallet address
   * @returns  true, if the minter is configured correctly
   */
  async checkAuthorizedMinter(
    networkId: NetworkIdentifier,
    walletAddress: string
  ): Promise<boolean> {
    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      console.debug(
        `Checking authorized minter status of account '${walletAddress}'`
      );
      const info = await client.request({
        command: "account_info",
        account: walletAddress,
        ledger_index: "validated",
      });
      const minter = (info.result.account_data as LedgerEntry.AccountRoot)
        .NFTokenMinter;
      return minter === wallet.classicAddress;
    } finally {
      await client.disconnect();
    }
  }

  /**
   * Create a sell offer for an NFT
   * @param networkId - network identifier
   * @param walletAddress - recipient wallet address (offer can only be accepted by this account)
   * @param tokenId - account wallet address
   * @returns sell offer index and tx fee costs
   */
  async createSellOffer(
    networkId: NetworkIdentifier,
    walletAddress: string,
    tokenId: string
  ): Promise<[string, bigint]> {
    if (!(await this.checkAccountExists(networkId, walletAddress))) {
      throw new AttendifyError("Unable to find account on the XRPL");
    }

    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      console.debug(`Creating NFT sell offer for '${tokenId}'`);
      const tx: TxResponse<NFTokenCreateOffer> = await client.submitAndWait(
        {
          TransactionType: "NFTokenCreateOffer",
          Account: wallet.classicAddress,
          NFTokenID: tokenId,
          Amount: "0",
          Flags: NFTokenCreateOfferFlags.tfSellNFToken,
          Destination: walletAddress,
        },
        {
          failHard: true,
          wallet: wallet,
        }
      );

      const offerIndex = (tx.result.meta as any).offer_id as string;
      const accumulatedTxFees = BigInt(tx.result.Fee || FALLBACK_TX_FEE);

      return [offerIndex, accumulatedTxFees];
    } finally {
      client.disconnect();
    }
  }

  /**
   * Add a single participant to an existing event
   * @param eventId - event identifier
   * @param walletAddress - wallet address of the new participant
   * @param createOffer - immediately create an NFT sell offer
   * @param checkIsManaged - validate whether the event is managed, restrict access accordingly
   */
  async addParticipant(
    eventId: number,
    walletAddress: string,
    createOffer: boolean,
    checkIsManaged: boolean
  ): Promise<Record<string, any>> {
    return await db.transaction(async (t) => {
      const event = await orm.Event.findOne({
        where: { id: eventId },
        include: [orm.Event.associations.accounting],
        lock: true,
        transaction: t,
      });

      if (!event) {
        throw new AttendifyError("Invalid event ID");
      }
      if (event.status !== EventStatus.ACTIVE) {
        throw new AttendifyError("Event is not active");
      }
      if ((await event.countAttendees()) >= event.tokenCount) {
        throw new AttendifyError("Event already full");
      }
      if (await event.hasAttendee(walletAddress)) {
        throw new AttendifyError("User is already a participant");
      }
      if (
        checkIsManaged &&
        event.isManaged &&
        event.ownerWalletAddress !== walletAddress
      ) {
        throw new AttendifyError("Not allowed to join private event");
      }

      const user = await orm.User.findOne({
        where: { walletAddress: walletAddress },
        transaction: t,
      });
      if (!user) {
        throw new AttendifyError("Unable to find user");
      }

      // find an available NFT that has not been assigned to a claim
      const nft = (
        await orm.NFT.findAll({
          where: {
            eventId: event.id,
          },
          include: [
            {
              association: orm.NFT.associations.claim,
              required: false,
              attributes: ["id"],
            },
          ],
          transaction: t,
        })
      ).find((x) => x.claim === null);
      if (!nft) {
        // Note: this should never happen unless db is out of sync
        throw new AttendifyError("No more available slots");
      }

      let offerIndex: string | undefined = undefined;
      let txFees: bigint | undefined = undefined;
      if (createOffer) {
        [offerIndex, txFees] = await this.createSellOffer(
          event.networkId,
          walletAddress,
          nft.id
        );
      }

      // add the participant
      await event.addAttendee(user, { transaction: t });

      const claim = await user.createClaim(
        {
          tokenId: nft.id,
          offerIndex: offerIndex ?? null,
          claimed: false,
        },
        { transaction: t }
      );

      // accumulate fees
      if (txFees) {
        assert(event.accounting);
        await event.accounting?.update(
          {
            accumulatedTxFees: (
              BigInt(event.accounting?.accumulatedTxFees) + txFees
            ).toString(),
          },
          { transaction: t }
        );
      }

      return claim.toJSON();
    });
  }

  /**
   * Add several participants to an existing event
   * @param eventId - event identifier
   * @param walletAddress - event owner wallet address
   * @param attendeeWalletAddresses - list of wallet addresses of new participants
   * @param createOffer - immediately create an NFT sell offer
   */
  async addParticipants(
    eventId: number,
    walletAddress: string,
    attendeeWalletAddresses: string[],
    createOffer: boolean
  ): Promise<void> {
    // check available spots
    const event = await db.transaction(async (t) => {
      return await orm.Event.findOne({
        where: { id: eventId },
        transaction: t,
      });
    });

    if (!event) {
      throw new AttendifyError("Invalid event ID");
    }
    if (event.ownerWalletAddress !== walletAddress) {
      throw new AttendifyError("Only Owner can add participants");
    }
    if (
      event.tokenCount <
      attendeeWalletAddresses.length + (await event.countAttendees())
    ) {
      throw new AttendifyError("Not enough available slots");
    }

    for (const address of attendeeWalletAddresses) {
      await this.addParticipant(eventId, address, createOffer, false);
    }
  }

  /**
   * Check if an NFT sell offer exists on chain
   * @param networkId - network identifier
   * @param tokenId - NFT identifier
   * @param offerIndex - NFT sell offer index
   * @returns true, if sell offer exists
   */
  async checkSellOffer(
    networkId: NetworkIdentifier,
    tokenId: string,
    offerIndex: string
  ): Promise<boolean> {
    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      console.debug(`Checking NFT sell offer '${offerIndex}'`);
      // Note: this throws, if there are no offers
      const offerInfo = await client.request({
        command: "nft_sell_offers",
        nft_id: tokenId,
        ledger_index: "validated",
      });
      return !!offerInfo.result.offers.find((obj) => {
        return obj.nft_offer_index === offerIndex;
      });
    } catch (error) {
      if (error instanceof RippledError) {
        if ((error.data as any)?.error_code === 92) {
          return false;
        }
      }
      throw error;
    } finally {
      await client.disconnect();
    }
  }

  /**
   * Find all NFTs owned by a particular account
   * @param networkId - network identifier
   * @param walletAddress - request wallet address
   * @param taxon - optional filter
   * @returns array of token identifier
   */
  async fetchNFTs(
    networkId: NetworkIdentifier,
    walletAddress: string,
    taxon?: number
  ): Promise<string[]> {
    console.debug(`Fetching NFTs for account ${walletAddress}`);

    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      // find all existing NFTs
      const tokenIds: string[] = [];
      let res: AccountNFTsResponse | undefined = undefined;
      do {
        res = await client.request({
          command: "account_nfts",
          account: walletAddress,
          ledger_index: "validated",
          limit: 400,
          marker: res ? res.result.marker : undefined,
        });

        // filter results, extract id
        tokenIds.push(
          ...res.result.account_nfts
            .filter((x) => (taxon ? x.NFTokenTaxon === taxon : true))
            .map((x) => x.NFTokenID)
        );
      } while (res.result.marker);
      console.debug(`Found ${tokenIds.length} NFT(s) (filter: ${taxon})`);

      return tokenIds;
    } finally {
      await client.disconnect();
    }
  }

  /**
   * Check if the vault account has enough balance to create N ledger objects
   * @param networkId - network identifier
   * @param count - number of new objects
   * @returns reserve and balance info
   */
  async checkOwnerReserve(
    networkId: NetworkIdentifier,
    count: number
  ): Promise<[bigint, bigint, boolean]> {
    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      // TODO consider caching the result
      const state = await client.request({
        command: "server_info",
      });
      const ledger = state.result.info.validated_ledger;
      if (!ledger) {
        throw new AttendifyError("Unable to fetch server info");
      }

      const info = await client.request({
        command: "account_info",
        account: wallet.classicAddress,
        ledger_index: "validated",
      });

      const balance = BigInt(info.result.account_data.Balance);

      // current account reserves
      const reserve =
        BigInt(xrpToDrops(ledger.reserve_base_xrp)) +
        BigInt(xrpToDrops(ledger.reserve_inc_xrp)) *
          BigInt(info.result.account_data.OwnerCount);

      const hasBalance =
        count <=
        (balance - reserve - BigInt(xrpToDrops(1))) /
          BigInt(xrpToDrops(ledger.reserve_inc_xrp));

      return [reserve, balance, hasBalance];
    } finally {
      await client.disconnect();
    }
  }

  /**
   * Fetch an NFT offer for a specific event from the database
   * @param walletAddress - request wallet address
   * @param eventId - event identifier
   * @returns offer json object
   */
  async getClaim(
    walletAddress: string,
    eventId: number
  ): Promise<Record<string, any> | null> {
    return await db.transaction(async (t) => {
      // query claim
      const claim = await orm.Claim.findOne({
        where: { ownerWalletAddress: walletAddress },
        include: [
          {
            association: orm.Claim.associations.token,
            where: { eventId: eventId },
            include: [orm.NFT.associations.event],
          },
        ],
        transaction: t,
      });

      if (!(claim && claim.token && claim.token.event)) {
        // user is not participant
        return null;
      }

      const networkId = claim.token.event.networkId;

      // verify on chain claimed status
      if (!claim.claimed) {
        if (claim.offerIndex) {
          // check if the sell offer still exists
          const claimed = !(await this.checkSellOffer(
            networkId,
            claim.tokenId,
            claim.offerIndex
          ));

          // update database accordingly
          if (claimed) {
            await claim.update({ claimed: true }, { transaction: t });
          }
        } else {
          // sell offer was previously not created on chain, do it now
          const [offerIndex, txFees] = await this.createSellOffer(
            networkId,
            walletAddress,
            claim.token.id
          );

          await claim.update({ offerIndex: offerIndex }, { transaction: t });

          // accumulate fees
          assert(claim.token.event.accounting);
          await claim.token.event.accounting?.update(
            {
              accumulatedTxFees: (
                BigInt(claim.token.event.accounting?.accumulatedTxFees) + txFees
              ).toString(),
            },
            { transaction: t }
          );
        }
      }

      return claim.toJSON();
    });
  }

  /**
   * Fetch authorized minter status for an account
   * @param networkId - network identifier
   * @param walletAddress - account wallet address
   * @returns status info
   */
  async getMinterStatus(
    networkId: NetworkIdentifier,
    walletAddress: string
  ): Promise<[string, boolean]> {
    const [client, wallet] = this.getNetworkConfig(networkId);
    const hasMinter = await this.checkAuthorizedMinter(
      networkId,
      walletAddress
    );
    return [wallet.classicAddress, hasMinter];
  }

  /**
   * Prepare ledger Ticket objects for NFT batch minting
   * @param networkId - network identifier
   * @param target - number of tickets that should be set up
   * @returns array of at least `target` ticket sequence numbers and tx fee costs
   */
  async prepareTickets(
    networkId: NetworkIdentifier,
    target: number
  ): Promise<[number[], bigint]> {
    console.debug(`Preparing ${target} ticket(s)`);
    target = Math.floor(target);
    if (target > 250) {
      throw new AttendifyError("An account can at most have 250 tickets");
    }

    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      // find all existing tickets
      const tickets: LedgerEntry.Ticket[] = [];
      let res: AccountObjectsResponse | undefined = undefined;
      do {
        res = await client.request({
          command: "account_objects",
          account: wallet.classicAddress,
          ledger_index: "validated",
          type: "ticket",
          limit: 400,
          marker: res ? res.result.marker : undefined,
        });
        tickets.push(...(res.result.account_objects as LedgerEntry.Ticket[]));
      } while (res.result.marker);
      console.debug(`Found ${tickets.length} existing ticket(s)`);

      // determine the number of new tickets needed
      const ticketSequences = tickets.map((t) => t.TicketSequence);
      const ticketCount = target - ticketSequences.length;
      if (ticketCount <= 0) {
        return [ticketSequences, 0n];
      }

      const [reserve, balance, hasBalance] = await this.checkOwnerReserve(
        networkId,
        ticketCount
      );
      if (!hasBalance) {
        throw new AttendifyError(
          "Insufficient balance to cover owner reserves"
        );
      }

      // create new tickets
      console.debug(`Creating ${ticketCount} new ticket(s)`);
      const tx: TxResponse<TicketCreate> = await client.submitAndWait(
        {
          TransactionType: "TicketCreate",
          Account: wallet.classicAddress,
          TicketCount: ticketCount,
        },
        {
          failHard: true,
          wallet: wallet,
        }
      );

      // extract new ticket sequences
      (tx.result.meta as TransactionMetadata).AffectedNodes.forEach((node) => {
        const type = Object.keys(node)[0];
        if (type === "CreatedNode") {
          const n = (node as CreatedNode).CreatedNode;
          if (n.LedgerEntryType === "Ticket") {
            ticketSequences.push(n.NewFields.TicketSequence as number);
          }
        }
      });

      const accumulatedTxFees = BigInt(tx.result.Fee || FALLBACK_TX_FEE);

      return [ticketSequences, accumulatedTxFees];
    } finally {
      await client.disconnect();
    }
  }

  /**
   * Calculate the deposit value in drops for an event
   * @param networkId - network identifier
   * @param slots - number of event slots
   * @returns deposit requirements
   */
  async calcDepositValues(
    networkId: NetworkIdentifier,
    slots: number
  ): Promise<[bigint, bigint]> {
    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      // TODO consider caching the result
      const state = await client.request({
        command: "server_info",
      });
      const ledger = state.result.info.validated_ledger;
      if (!ledger) {
        throw new AttendifyError("Unable to fetch server info");
      }

      // NFT page reserve (https://xrpl.org/nftokenpage.html#the-reserve-in-practice)
      // worst case (16 per page), round up to next even integer
      const pageReserve =
        BigInt(xrpToDrops(ledger.reserve_inc_xrp)) * (BigInt(slots + 15) / 16n);

      // NFT offer reserve
      const offerReserve =
        BigInt(xrpToDrops(ledger.reserve_inc_xrp)) * BigInt(slots);

      const depositReserve = pageReserve + offerReserve;

      return [depositReserve, DEPOSIT_FEE];
    } finally {
      await client.disconnect();
    }
  }

  /**
   * Create a new event
   * @param networkId - network identifier
   * @param walletAddress - event owner wallet address
   * @param metadata - event information/details
   * @param isManaged - event signup permissions
   * @returns new event id
   */
  async createEvent(
    networkId: NetworkIdentifier,
    walletAddress: string,
    metadata: Metadata,
    isManaged: boolean
  ): Promise<number> {
    if (!(await this.checkAccountExists(networkId, walletAddress))) {
      throw new AttendifyError("Unable to find account on the XRPL");
    }

    const owner = await db.transaction(async (t) => {
      return await orm.User.findOne({
        where: { walletAddress: walletAddress },
        transaction: t,
      });
    });
    if (!owner) {
      throw new AttendifyError("Unable to find user");
    }

    const eventId = this.nextEventId;
    const tokenCount = metadata.tokenCount;

    const [client, wallet] = this.getNetworkConfig(networkId);
    const [depositReserveValue, depositFeeValue] = await this.calcDepositValues(
      networkId,
      tokenCount
    );

    // add event to database
    const event = await db.transaction(async (t) => {
      const event = await owner.createEvent(
        {
          id: eventId,
          status: EventStatus.PENDING,
          networkId: networkId,
          title: metadata.title,
          description: metadata.description,
          location: metadata.location,
          tokenCount: tokenCount,
          imageUrl: metadata.imageUrl,
          uri: null,
          dateStart: metadata.dateStart,
          dateEnd: metadata.dateEnd,
          isManaged: isManaged,
        },
        { transaction: t }
      );

      // add accounting
      await event.createAccounting(
        {
          depositAddress: wallet.classicAddress,
          depositReserveValue: depositReserveValue.toString(),
          depositFeeValue: depositFeeValue.toString(),
          accumulatedTxFees: "0",
        },
        { transaction: t }
      );

      // increment next event id
      this.nextEventId++;

      return event;
    });

    return event.id;
  }

  /**
   * Pre-mint NFTs for a pending event
   * @param eventId - event identifier
   * @returns
   */
  async mintEvent(eventId: number): Promise<void> {
    const event = await db.transaction(async (t) => {
      return await orm.Event.findOne({
        where: { id: eventId },
        include: [orm.Event.associations.accounting],
        transaction: t,
      });
    });

    if (!event) {
      throw new AttendifyError("Invalid event ID");
    }
    if (event.status !== EventStatus.PAID) {
      throw new AttendifyError("Event is not paid for");
    }

    // upload metadata
    const metadata: Metadata = {
      title: event.title,
      description: event.description,
      location: event.location,
      imageUrl: event.imageUrl,
      tokenCount: event.tokenCount,
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
    };

    const metadataUrl = await postToIPFS(JSON.stringify(metadata));

    // mint NFTs
    const { networkId, tokenCount } = event;

    let accumulatedTxFees = 0n;
    const tokenIds: string[] = [];

    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      console.debug(`Batch minting ${tokenCount} NFT(s)`);

      // Note: Using the event deposit to cover temporary ticket reserves.
      // We require a deposit of at least 2 XRP for an event slot, which is
      // enough to cover the reserve costs of a single ticket. Therefore, we
      // can mint with max chunk size as we require no platform resources.
      const chunkSize = MAX_ALLOWED_TICKETS;
      for (let i = 0; i < tokenCount; i += chunkSize) {
        const chunkTokenCount = Math.min(chunkSize, tokenCount - i);

        // prepare tickets
        const [ticketSequences, txFees] = await this.prepareTickets(
          event.networkId,
          chunkTokenCount
        );

        const promises: Promise<TxResponse<NFTokenMint>>[] = [];
        for (let j = 0; j < chunkTokenCount; ++j) {
          console.debug(`Minting NFT ${i + j + 1}/${tokenCount}`);
          promises.push(
            client.submitAndWait(
              {
                TransactionType: "NFTokenMint",
                Account: wallet.classicAddress,
                URI: convertStringToHex(metadataUrl),
                TransferFee: 0,
                Sequence: 0,
                TicketSequence: ticketSequences[j],
                NFTokenTaxon: eventId,
                Issuer: event.ownerWalletAddress,
              },
              {
                failHard: true,
                wallet: wallet,
              }
            )
          );
        }

        let txs: TxResponse<NFTokenMint>[];
        try {
          txs = await Promise.all(promises);
        } catch (err) {
          console.debug(err);
          await this.cancelEvent(event.id);
          throw new AttendifyError("NFT mint failed");
        }

        const ids = txs.map((tx) => (tx.result.meta as any).nftoken_id);
        accumulatedTxFees +=
          txFees +
          txs.reduce<bigint>(
            (accumulator, tx) =>
              accumulator + BigInt(tx.result.Fee || FALLBACK_TX_FEE),
            BigInt(0)
          );

        if (ids.length != chunkTokenCount) {
          await this.cancelEvent(event.id);
          throw new AttendifyError("NFT mint verification failed");
        }

        tokenIds.push(...ids);
      }

      // mark event as active
      await db.transaction(async (t) => {
        await event.reload({
          lock: true,
          include: [orm.Event.associations.accounting],
          transaction: t,
        });

        await event.update(
          {
            status: EventStatus.ACTIVE,
            uri: metadataUrl,
          },
          { transaction: t }
        );

        assert(event.accounting);
        await event.accounting?.update(
          {
            accumulatedTxFees: (
              BigInt(event.accounting?.accumulatedTxFees) + accumulatedTxFees
            ).toString(),
          },
          { transaction: t }
        );

        // add NFTs
        for (let i = 0; i < tokenIds.length; ++i) {
          await event.createNft(
            {
              id: tokenIds[i],
              issuerWalletAddress: event.ownerWalletAddress,
            },
            { transaction: t }
          );
        }
      });
    } finally {
      client.disconnect();
    }
  }

  /**
   * Cancel an event
   * @param eventId - event identifier
   */
  async cancelEvent(eventId: number): Promise<void> {
    await db.transaction(async (t) => {
      const event = await orm.Event.findOne({
        where: { id: eventId },
        transaction: t,
      });

      if (!event) {
        throw new AttendifyError("Unable to find event");
      }
      if (
        ![EventStatus.PENDING, EventStatus.PAID, EventStatus.ACTIVE].includes(
          event.status
        )
      ) {
        throw new AttendifyError("Event is not pending, paid or active");
      }

      await event.update({ status: EventStatus.CANCELED }, { transaction: t });
    });
  }

  /**
   * Close an event
   * @param eventId - event identifier
   */
  async closeEvent(eventId: number): Promise<void> {
    const event = await db.transaction(async (t) => {
      return await orm.Event.findOne({
        where: { id: eventId },
        include: [
          orm.Event.associations.accounting,
          orm.Event.associations.owner,
          {
            association: orm.Event.associations.nfts,
            include: [orm.NFT.associations.claim],
            required: true,
          },
        ],
        transaction: t,
      });
    });

    if (!event || !event.nfts) {
      throw new AttendifyError("Unable to find event");
    }
    if (event.status !== EventStatus.CANCELED) {
      throw new AttendifyError("Event is not canceled");
    }

    let accumulatedTxFees = 0n;

    // Note: burning an NFT also removes owner reserves of pending sell offers
    const [client, wallet] = this.getNetworkConfig(event.networkId);
    await client.connect();
    try {
      console.debug(`Preparing NFT burn for event ${event.id}`);
      // based on chain (only currently owned)
      const tokenIds = await this.fetchNFTs(
        event.networkId,
        wallet.classicAddress,
        event.id
      );

      // batch burn
      console.debug(`Batch burning ${tokenIds.length} NFT(s)`);

      // Note: Using an exponentially growing chunk size for burning. We require
      // a deposit of at least 2 XRP for an event slot. For every freed up slot,
      // we can cover an additional ticket in the next burning round by making
      // use of the event deposit.
      for (
        let i = 0, chunkSize = this.maxTickets;
        i < tokenIds.length;
        i += chunkSize, chunkSize = Math.min(chunkSize * 2, MAX_ALLOWED_TICKETS)
      ) {
        const chunk = tokenIds.slice(i, i + chunkSize);
        const tokenCount = Math.min(chunk.length, chunkSize);

        // prepare tickets
        const [ticketSequences, txFees] = await this.prepareTickets(
          event.networkId,
          tokenCount
        );

        const promises: Promise<TxResponse<NFTokenBurn>>[] = [];
        for (let j = 0; j < tokenCount; ++j) {
          console.debug(`Burning NFT ${i + j + 1}/${tokenIds.length}`);
          promises.push(
            client.submitAndWait(
              {
                TransactionType: "NFTokenBurn",
                Account: wallet.classicAddress,
                Sequence: 0,
                TicketSequence: ticketSequences[j],
                NFTokenID: chunk[j],
              },
              {
                failHard: true,
                wallet: wallet,
              }
            )
          );
        }

        // TODO possible race condition
        // trying to burn an NFT with an offer that someone just accepted
        let txs: TxResponse<NFTokenBurn>[];
        try {
          txs = await Promise.all(promises);
        } catch (err) {
          console.debug(err);
          throw new AttendifyError("NFT burn failed");
        }

        accumulatedTxFees +=
          txFees +
          txs.reduce<bigint>(
            (accumulator, tx) =>
              accumulator + BigInt(tx.result.Fee || FALLBACK_TX_FEE),
            BigInt(0)
          );
      }
    } finally {
      client.disconnect();
    }

    // mark event as closed
    await db.transaction(async (t) => {
      await event.reload({
        lock: true,
        include: [orm.Event.associations.accounting],
        transaction: t,
      });

      await event.update(
        {
          status: EventStatus.CLOSED,
        },
        { transaction: t }
      );

      assert(event.accounting);
      await event.accounting?.update(
        {
          accumulatedTxFees: (
            BigInt(event.accounting?.accumulatedTxFees) + accumulatedTxFees
          ).toString(),
        },
        { transaction: t }
      );
    });
  }

  /**
   * Verify an event deposit transaction
   * @param networkId - network identifier
   * @param txHash - transaction hash
   * @returns true, if the payment was successful
   */
  async checkPayment(
    networkId: NetworkIdentifier,
    txHash: string
  ): Promise<boolean> {
    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      const tx = (await client.request({
        command: "tx",
        transaction: txHash,
      })) as TxResponse<Payment>;

      // check basic
      if (tx.status && tx.status !== "success") {
        return false;
      }

      if (!tx.result.validated) {
        return false;
      }

      if (
        (tx.result.meta as TransactionMetadata)?.TransactionResult !==
        "tesSUCCESS"
      ) {
        return false;
      }

      if (tx.result.Memos?.length !== 1) {
        return false;
      }

      // check memo
      const memo = tx.result.Memos[0].Memo.MemoData;
      if (!memo) {
        return false;
      }

      const data = Buffer.from(memo, "hex").toString("utf8");

      const re = new RegExp("^deposit event ([0-9]{1,7})$", "i");
      const match = data.match(re);
      if (!match) {
        return false;
      }

      // load event
      const eventId = match[1];
      return await db.transaction(async (t) => {
        const event = await orm.Event.findByPk(eventId, {
          include: [orm.Event.associations.accounting],
          lock: true,
          transaction: t,
        });

        if (!event || !event.accounting) {
          return false;
        }
        if (event.status !== EventStatus.PENDING) {
          return false;
        }

        // check destination address
        if (event.accounting.depositAddress !== tx.result.Destination) {
          return false;
        }

        // check amount
        const amount = (tx.result.meta as TransactionMetadata)
          ?.delivered_amount;
        const amountExpected = (
          BigInt(event.accounting.depositReserveValue) +
          BigInt(event.accounting.depositFeeValue)
        ).toString();
        if (amount !== amountExpected) {
          return false;
        }

        // check tx hash (redundant sanity check)
        if (
          event.accounting.depositTxHash &&
          event.accounting.depositTxHash !== tx.result.hash
        ) {
          return false;
        }

        // update event status
        await event.accounting?.update(
          {
            depositTxHash: tx.result.hash,
          },
          { transaction: t }
        );

        await event.update(
          {
            status: EventStatus.PAID,
          },
          { transaction: t }
        );

        return true;
      });
    } finally {
      client.disconnect();
    }
  }

  /**
   * Refund event deposit
   * @param eventId - event identifier
   * @returns tx hash
   */
  async refundDeposit(eventId: number): Promise<string> {
    const hash = await db.transaction(async (t) => {
      const event = await orm.Event.findByPk(eventId, {
        include: [orm.Event.associations.accounting],
        lock: true,
        transaction: t,
      });

      if (!event || !event.accounting) {
        throw new AttendifyError("Unable to find event");
      }
      if (event.status !== EventStatus.CLOSED) {
        throw new AttendifyError("Event is not closed");
      }
      if (event.accounting.refundValue || event.accounting.refundTxHash) {
        throw new AttendifyError("Event deposit was already refunded");
      }

      // account for refund payment tx fee
      const value = (
        BigInt(event.accounting.depositReserveValue) +
        BigInt(event.accounting.depositFeeValue) -
        BigInt(event.accounting.accumulatedTxFees) -
        FALLBACK_TX_FEE
      ).toString();

      await event.update(
        {
          status: EventStatus.REFUNDED,
        },
        { transaction: t }
      );

      const [client, wallet] = this.getNetworkConfig(event.networkId);
      await client.connect();
      try {
        const response = await client.submitAndWait(
          {
            TransactionType: "Payment",
            Account: wallet.classicAddress,
            Amount: value,
            Destination: event.ownerWalletAddress,
          },
          {
            failHard: true,
            wallet: wallet,
          }
        );

        await event.accounting?.update(
          {
            refundValue: value,
            refundTxHash: response.result.hash,
          },
          { transaction: t }
        );

        return response.result.hash;
      } finally {
        client.disconnect();
      }
    });

    return hash;
  }

  /**
   * Fetch all events from the database
   * @param networkId - network identifier
   * @param limit - maximum number of returned results
   * @returns list of event json objects
   */
  async getEventsAll(
    networkId: NetworkIdentifier,
    limit: number = 100
  ): Promise<Record<string, any>[]> {
    const events = await db.transaction(async (t) => {
      return await orm.Event.findAll({
        order: [["id", "DESC"]],
        limit: limit,
        where: {
          ...(networkId !== NetworkIdentifier.UNKNOWN
            ? { networkId: networkId }
            : {}),
        },
        include: [
          orm.Event.associations.accounting,
          {
            association: orm.Event.associations.attendees,
            through: { attributes: [] }, // exclude: 'Participation'
          },
          orm.Event.associations.owner,
        ],
        transaction: t,
      });
    });

    return events.map((event) => event.toJSON());
  }

  /**
   * Fetch user owned events from the database
   * @param networkId - network identifier
   * @param walletAddress - wallet address of the user
   * @param limit - maximum number of returned results
   * @returns list of event json objects
   */
  async getEventsOwned(
    networkId: NetworkIdentifier,
    walletAddress: string,
    limit: number = 100
  ): Promise<Record<string, any>[]> {
    const events = await db.transaction(async (t) => {
      return await orm.Event.findAll({
        order: [["id", "DESC"]],
        limit: limit,
        where: {
          ...(networkId !== NetworkIdentifier.UNKNOWN
            ? { networkId: networkId }
            : {}),
          ownerWalletAddress: walletAddress,
        },
        include: [
          orm.Event.associations.accounting,
          {
            association: orm.Event.associations.attendees,
            through: { attributes: [] }, // exclude: 'Participation'
          },
          orm.Event.associations.owner,
        ],
        transaction: t,
      });
    });

    return events.map((event) => event.toJSON());
  }

  /**
   * Fetch active events that have ended (used by daemon)
   * @param networkId - network identifier
   * @param walletAddress - optionally filter by owner wallet address
   * @returns list of event json objects
   */
  async getEventsExpired(
    networkId: NetworkIdentifier,
    walletAddress?: string
  ): Promise<Record<string, any>[]> {
    const events = await db.transaction(async (t) => {
      return await orm.Event.findAll({
        where: {
          status: EventStatus.ACTIVE,
          dateEnd: {
            [Op.lt]: Date.now(),
          },
          ...(networkId !== NetworkIdentifier.UNKNOWN
            ? { networkId: networkId }
            : {}),
          ...(walletAddress ? { ownerWalletAddress: walletAddress } : {}),
        },
        transaction: t,
      });
    });

    return events.map((event) => event.toJSON());
  }

  /**
   * Fetch specific events (used by daemon)
   * @param networkId - network identifier
   * @param status - optionally filter by status
   * @param walletAddress - optionally filter by owner wallet address
   * @returns list of event json objects
   */
  async getEventsFiltered(
    networkId: NetworkIdentifier,
    status?: EventStatus,
    walletAddress?: string
  ): Promise<Record<string, any>[]> {
    const events = await db.transaction(async (t) => {
      return await orm.Event.findAll({
        where: {
          ...(status ? { status: status } : {}),
          ...(networkId !== NetworkIdentifier.UNKNOWN
            ? { networkId: networkId }
            : {}),
          ...(walletAddress ? { ownerWalletAddress: walletAddress } : {}),
        },
        transaction: t,
      });
    });

    return events.map((event) => event.toJSON());
  }

  /**
   * Fetch NFT offers associated with a user from the database
   * @param networkId - network identifier
   * @param walletAddress - wallet address of the user
   * @param limit - maximum number of returned results
   * @returns list of offer json objects (including associated event info)
   */
  async getOffers(
    networkId: NetworkIdentifier,
    walletAddress: string,
    limit: number = 100
  ): Promise<Record<string, any>[]> {
    const offers = await db.transaction(async (t) => {
      return await orm.Claim.findAll({
        order: [["id", "DESC"]],
        limit: limit,
        where: {
          ownerWalletAddress: walletAddress,
        },
        include: [
          {
            association: orm.Claim.associations.token,
            include: [
              {
                association: orm.NFT.associations.event,
                where: {
                  ...(networkId !== NetworkIdentifier.UNKNOWN
                    ? { networkId: networkId }
                    : {}),
                },
              },
            ],
            required: true,
          },
        ],
        transaction: t,
      });
    });

    return offers.map((offer) => offer.toJSON());
  }

  /**
   * Fetch a specific event from the database
   * @param eventId - event identifier
   * @param walletAddress - optional request wallet address to filter results depending on access level
   * @returns event json object
   */
  async getEvent(
    eventId: number,
    walletAddress?: string
  ): Promise<Record<string, any> | undefined> {
    return await db.transaction(async (t) => {
      const event = await orm.Event.findOne({
        where: { id: eventId },
        include: [
          orm.Event.associations.accounting,
          {
            association: orm.Event.associations.attendees,
            through: { attributes: [] }, // exclude: 'Participation'
          },
          orm.Event.associations.nfts,
          orm.Event.associations.owner,
        ],
        transaction: t,
      });

      // if managed, restrict access to owner or attendee
      if (event?.isManaged) {
        if (
          event.ownerWalletAddress !== walletAddress &&
          !(
            walletAddress &&
            (await event.hasAttendee(walletAddress, { transaction: t }))
          )
        ) {
          return undefined;
        }
      }

      // if owner, add more info
      if (event && event.ownerWalletAddress !== walletAddress) {
        event.accounting = undefined;
        event.attendees = undefined;
        event.nfts = undefined;
      }

      return event?.toJSON();
    });
  }

  /**
   * Fetch a specific user from the database
   * @param walletAddress - wallet address of the user
   * @param includeEvents - include a list of events the user is attending
   * @param allowCreation - create new user, if it doesn't exist
   * @param isOrganizer - when creating a new user, add organizer permissions
   * @returns - user json object
   */
  async getUser(
    walletAddress: string,
    includeEvents: boolean,
    allowCreation: boolean,
    isOrganizer: boolean
  ): Promise<Record<string, any> | undefined> {
    const options = {
      where: { walletAddress: walletAddress },
      include: [
        ...(includeEvents
          ? [
              {
                association: orm.User.associations.attendances,
                through: { attributes: [] }, // exclude: 'Participation'
              },
            ]
          : []),
      ],
    };

    const user = await db.transaction(async (t) => {
      if (allowCreation) {
        const [result, created] = await orm.User.findOrCreate({
          ...options,
          defaults: {
            walletAddress: walletAddress,
            isOrganizer: isOrganizer,
            isAdmin: false,
          },
          transaction: t,
        });
        return result;
      } else {
        const result = await orm.User.findOne({ ...options, transaction: t });
        return result;
      }
    });

    return user?.toJSON();
  }

  /**
   * Update a specific user in the database
   * @param walletAddress - wallet address of the user
   * @param firstName - optional first name
   * @param lastName - optional last name
   * @param email - optional email address
   */
  async updateUser(
    walletAddress: string,
    firstName: string | null,
    lastName: string | null,
    email: string | null
  ): Promise<void> {
    await db.transaction(async (t) => {
      const user = await orm.User.findOne({
        where: {
          walletAddress: walletAddress,
        },
        rejectOnEmpty: true,
        transaction: t,
      });

      await user.update(
        {
          firstName,
          lastName,
          email,
        },
        { transaction: t }
      );
    });
  }

  /**
   * Fetch a list of all users
   * @param networkId - network identifier (currently ignored)
   * @returns list of user json objects
   */
  async getUsers(networkId: NetworkIdentifier): Promise<Record<string, any>[]> {
    const users = await db.transaction(async (t) => {
      return await orm.User.findAll({
        order: [["walletAddress", "ASC"]],
        where: {
          walletAddress: {
            [Op.notIn]: this.networkConfigs
              .filter((c) => isValidSecret(c.vaultWalletSeed))
              .map((c) => Wallet.fromSeed(c.vaultWalletSeed).classicAddress),
          },
        },
        transaction: t,
      });
    });

    return users.map((user) => user.toJSON());
  }

  /**
   * Fetch a list of all organizers
   * @param networkId - network identifier (currently ignored)
   * @returns list of user json objects
   */
  async getOrganizers(
    networkId: NetworkIdentifier
  ): Promise<Record<string, any>[]> {
    const users = await db.transaction(async (t) => {
      return await orm.User.findAll({
        order: [["walletAddress", "ASC"]],
        where: {
          walletAddress: {
            [Op.notIn]: this.networkConfigs
              .filter((c) => isValidSecret(c.vaultWalletSeed))
              .map((c) => Wallet.fromSeed(c.vaultWalletSeed).classicAddress),
          },
          isOrganizer: true,
        },
        include: [
          orm.User.associations.events,
          {
            association: orm.User.associations.events,
            include: [orm.Event.associations.accounting],
            required: true,
          },
        ],
        transaction: t,
      });
    });

    return users.map((user) => user.toJSON());
  }

  /**
   * Compute platform usage information
   * @param networkId - network identifier
   * @returns usage statistics
   */
  async getStats(networkId: NetworkIdentifier): Promise<PlatformStats> {
    const [reserve, balance, hasBalance] = await this.checkOwnerReserve(
      networkId,
      0
    );

    // Note: excluding vault wallet users
    return await db.transaction(async (t) => {
      const userCount = await orm.User.count({
        where: {
          walletAddress: {
            [Op.notIn]: this.networkConfigs
              .filter((c) => isValidSecret(c.vaultWalletSeed))
              .map((c) => Wallet.fromSeed(c.vaultWalletSeed).classicAddress),
          },
        },
        transaction: t,
      });

      const organizerCount = await orm.User.count({
        where: {
          walletAddress: {
            [Op.notIn]: this.networkConfigs
              .filter((c) => isValidSecret(c.vaultWalletSeed))
              .map((c) => Wallet.fromSeed(c.vaultWalletSeed).classicAddress),
          },
          isOrganizer: true,
        },
        transaction: t,
      });

      const adminCount = await orm.User.count({
        where: {
          walletAddress: {
            [Op.notIn]: this.networkConfigs
              .filter((c) => isValidSecret(c.vaultWalletSeed))
              .map((c) => Wallet.fromSeed(c.vaultWalletSeed).classicAddress),
          },
          isAdmin: true,
        },
        transaction: t,
      });

      const eventCount = await orm.Event.count({
        where: {
          networkId: NetworkIdentifier.TESTNET,
        },
        transaction: t,
      });

      const pendingCount = await orm.Event.count({
        where: {
          networkId: NetworkIdentifier.TESTNET,
          status: EventStatus.PENDING,
        },
        transaction: t,
      });

      const activeCount = await orm.Event.count({
        where: {
          networkId: NetworkIdentifier.TESTNET,
          status: {
            [Op.or]: [EventStatus.PAID, EventStatus.ACTIVE],
          },
        },
        transaction: t,
      });

      const finishedCount = await orm.Event.count({
        where: {
          networkId: NetworkIdentifier.TESTNET,
          status: {
            [Op.or]: [EventStatus.CLOSED, EventStatus.REFUNDED],
          },
        },
        transaction: t,
      });

      // TODO sum slots of all paid+active events -> calc reserve, compare to actual reserve

      return {
        users: {
          total: userCount,
          organizers: organizerCount,
          admins: adminCount,
        },
        events: {
          total: eventCount,
          pending: pendingCount,
          active: activeCount,
          finished: finishedCount,
        },
        account: {
          balance: balance.toString(),
          reserve: reserve.toString(),
        },
      };
    });
  }
}
