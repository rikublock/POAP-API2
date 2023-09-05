import {
  AccountNFTsResponse,
  AccountObjectsResponse,
  Client,
  convertStringToHex,
  dropsToXrp,
  isValidSecret,
  LedgerEntry,
  NFTokenCreateOfferFlags,
  NFTokenMint,
  NFTokenMintFlags,
  RippledError,
  TransactionMetadata,
  TxResponse,
  Wallet,
  xrpToDrops,
} from "xrpl";
import type { CreatedNode } from "xrpl/dist/npm/models/transactions/metadata";
import { Op } from "sequelize";

import { AttendifyError } from "./error";
import { db, orm } from "./models";
import {
  Metadata,
  NetworkIdentifier,
  NetworkConfig,
  EventStatus,
  PlatformStats,
} from "../types";

/**
 * Attendify is an utility library for the Proof of Attendance infrastructure on the XRPL.
 */
export class Attendify {
  private nextEventId: number;
  private networkConfigs: NetworkConfig[];

  constructor(networkConfigs: NetworkConfig[], nextEventId: number = 0) {
    this.nextEventId = nextEventId;
    this.networkConfigs = networkConfigs;
  }

  /**
   * Initializes a new instance of the Attendify class.
   * This MUST be called before using the library.
   */
  async init() {
    // init database
    await db.authenticate();
    await db.sync({ force: false });

    // determine next event id
    const event = await orm.Event.findOne({
      order: [["id", "DESC"]],
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
            slots: 0,
          },
        });
      }
    }
  }

  /**
   * Get the configuration for a specific network
   * @param networkId - network identifier
   * @returns fresh wallet and client instance for a network
   */
  // TODO should cache the return values (manage connections)
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
   * @returns sell offer index
   */
  async createSellOffer(
    networkId: NetworkIdentifier,
    walletAddress: string,
    tokenId: string
  ): Promise<string> {
    if (!(await this.checkAccountExists(networkId, walletAddress))) {
      throw new AttendifyError("Unable to find account on the XRPL");
    }

    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      console.debug(`Creating NFT sell offer for '${tokenId}'`);
      const tx = await client.submitAndWait(
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

      return (tx.result.meta as any).offer_id as string;
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
  ): Promise<any> {
    const event = await orm.Event.findOne({
      where: { id: eventId },
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
      })
    ).find((x) => x.claim === null);
    if (!nft) {
      // Note: this should never happen unless db is out of sync
      throw new AttendifyError("No more available slots");
    }

    let offerIndex: string | undefined = undefined;
    if (createOffer) {
      offerIndex = await this.createSellOffer(
        event.networkId,
        walletAddress,
        nft.id
      );
    }

    // add the participant
    await event.addAttendee(user);

    const claim = await user.createClaim({
      tokenId: nft.id,
      offerIndex: offerIndex ?? null,
      claimed: false,
    });

    return claim.toJSON();
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
    const event = await orm.Event.findOne({
      where: { id: eventId },
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
        (balance - reserve - BigInt(1)) /
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
  async getClaim(walletAddress: string, eventId: number): Promise<any | null> {
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
    });
    if (!(claim && claim.token && claim.token.event)) {
      // user is not participant
      return null;
    }

    const networkId = claim.token.event.networkId as NetworkIdentifier;

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
          claim.claimed = true;
          await claim.save();
        }
      } else {
        // sell offer was previously not created on chain, do it now
        claim.offerIndex = await this.createSellOffer(
          networkId,
          walletAddress,
          claim.token.id
        );
        await claim.save();
      }
    }

    return claim.toJSON();
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
   * @returns array of at least `target` ticket sequence numbers
   */
  async prepareTickets(
    networkId: NetworkIdentifier,
    target: number
  ): Promise<number[]> {
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
        return ticketSequences;
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
      const tx = await client.submitAndWait(
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

      return ticketSequences;
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
  async calcDepositValue(
    networkId: NetworkIdentifier,
    slots: number
  ): Promise<bigint> {
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

      // max NTF offer reserves and 1 XRP for tx fees/creation charge
      const deposit =
        BigInt(xrpToDrops(ledger.reserve_inc_xrp)) * BigInt(slots) +
        BigInt(xrpToDrops(1));

      return deposit;
    } finally {
      await client.disconnect();
    }
  }

  /**
   * Create a new event and pre-mint NFTs
   * @param networkId - network identifier
   * @param walletAddress - event owner wallet address
   * @param metadata - event information/details
   * @param uri - IPFS url to metadata file for NFTs
   * @param isManaged - event signup permissions
   * @returns new event id
   */
  async createEvent(
    networkId: NetworkIdentifier,
    walletAddress: string,
    metadata: Metadata,
    uri: string,
    isManaged: boolean
  ): Promise<number> {
    if (!(await this.checkAccountExists(networkId, walletAddress))) {
      throw new AttendifyError("Unable to find account on the XRPL");
    }

    const owner = await orm.User.findOne({
      where: { walletAddress: walletAddress },
    });
    if (!owner) {
      throw new AttendifyError("Unable to find user");
    }

    const eventId = this.nextEventId;
    const tokenCount = metadata.tokenCount;

    // check slot availability
    const result = await orm.Event.findOne({
      where: {
        networkId: networkId,
        status: EventStatus.ACTIVE,
        ownerWalletAddress: walletAddress,
      },
      attributes: [[db.fn("sum", db.col("tokenCount")), "slots"]],
      raw: true,
    });

    const slots = ((result as any)?.slots as number) ?? 0;
    if (slots + tokenCount > owner.slots) {
      throw new AttendifyError("Not enough available event slots");
    }

    const ticketSequences = await this.prepareTickets(networkId, tokenCount);

    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      // batch mint
      console.debug(`Batch minting ${tokenCount} NFT(s)`);
      const promises: Promise<TxResponse<NFTokenMint>>[] = [];
      for (let i = 0; i < tokenCount; ++i) {
        console.debug(`Minting NFT ${i + 1}/${tokenCount}`);
        promises.push(
          client.submitAndWait(
            {
              TransactionType: "NFTokenMint",
              Account: wallet.classicAddress,
              URI: convertStringToHex(uri),
              Flags: NFTokenMintFlags.tfBurnable,
              TransferFee: 0,
              Sequence: 0,
              TicketSequence: ticketSequences[i],
              NFTokenTaxon: eventId,
            },
            {
              failHard: true,
              wallet: wallet,
            }
          )
        );
      }

      const txs = await Promise.all(promises);
      const tokenIds = txs.map((tx) => (tx.result.meta as any).nftoken_id);
      const accumulatedTxFees = txs.reduce<bigint>(
        (accumulator, tx) => accumulator + BigInt(tx.result.Fee || "0"),
        BigInt(0)
      );

      if (tokenIds.length != tokenCount) {
        throw new AttendifyError("NFT mint verification failed");
      }

      const depositValue = await this.calcDepositValue(networkId, tokenCount);

      // add event to database
      const event = await owner.createEvent({
        id: eventId,
        status: EventStatus.ACTIVE,
        networkId: networkId,
        title: metadata.title,
        description: metadata.description,
        location: metadata.location,
        tokenCount: tokenCount,
        imageUrl: metadata.imageUrl,
        uri: uri,
        dateStart: metadata.dateStart,
        dateEnd: metadata.dateEnd,
        isManaged: isManaged,
      });

      // add accounting
      await event.createAccounting({
        depositValue: Number(depositValue),
        accumulatedTxFees: Number(accumulatedTxFees),
      });

      // increment next event id
      this.nextEventId++;

      // add NFTs to database
      for (let i = 0; i < tokenIds.length; ++i) {
        await event.createNft({
          id: tokenIds[i],
          issuerWalletAddress: wallet.classicAddress,
        });
      }

      return event.id;
    } finally {
      client.disconnect();
    }
  }

  /**
   * Close or cancel an event
   * @param networkId - network identifier
   * @param burnAll - burn all tokens, including claimed NFTs (cancel event)
   */
  async closeEvent(eventId: number, burnAll?: boolean): Promise<void> {
    const event = await orm.Event.findOne({
      where: { id: eventId },
      include: [
        orm.Event.associations.owner,
        {
          association: orm.Event.associations.nfts,
          include: [orm.NFT.associations.claim],
          required: true,
        },
      ],
    });
    if (!event || !event.nfts) {
      throw new AttendifyError("Unable to find event");
    }
    if (event.status !== EventStatus.ACTIVE) {
      throw new AttendifyError("Event is not active");
    }

    // Note: burning an NFT also removes owner reserves of pending sell offers
    const [client, wallet] = this.getNetworkConfig(event.networkId);
    await client.connect();
    try {
      console.debug(`Preparing NFT burn for event ${event.id}`);
      let tokenIds: string[] = [];
      if (burnAll) {
        // based on database
        tokenIds = event.nfts.map((nft) => nft.id);
      } else {
        // based on chain (only currently owned)
        tokenIds = await this.fetchNFTs(
          event.networkId,
          wallet.classicAddress,
          event.id
        );
      }

      // batch burn
      console.debug(`Batch burning ${tokenIds.length} NFT(s)`);
      const promises = [];
      for (const id of tokenIds) {
        promises.push(
          client.submitAndWait(
            {
              TransactionType: "NFTokenBurn",
              Account: wallet.classicAddress,
              NFTokenID: id,
            },
            {
              failHard: true,
              wallet: wallet,
            }
          )
        );
      }

      await Promise.all(promises);
    } finally {
      client.disconnect();
    }

    // mark as closed/canceled in database
    if (burnAll) {
      event.status = EventStatus.CANCELED;
    } else {
      event.status = EventStatus.CLOSED;
    }
    await event.save();
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
  ): Promise<any[]> {
    const events = await orm.Event.findAll({
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
  ): Promise<any[]> {
    const events = await orm.Event.findAll({
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
    });
    return events.map((event) => event.toJSON());
  }

  /**
   * Fetch active events that have ended
   * @param networkId - network identifier
   * @param walletAddress - optionally filter by owner wallet address
   * @returns list of event json objects
   */
  async getEventsExpired(
    networkId: NetworkIdentifier,
    walletAddress?: string
  ): Promise<any[]> {
    const events = await orm.Event.findAll({
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
    });
    return events.map((event) => event.toJSON());
  }

  /**
   * Fetch NFT offers associated with a user from the database
   * @param eventId - event identifier
   * @param walletAddress - wallet address of the user
   * @param limit - maximum number of returned results
   * @returns list of offer json objects (including associated event info)
   */
  async getOffers(
    networkId: NetworkIdentifier,
    walletAddress: string,
    limit: number = 100
  ): Promise<any[]> {
    const offers = await orm.Claim.findAll({
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
  ): Promise<any | undefined> {
    const event = await orm.Event.findOne({
      where: { id: eventId },
      include: [
        orm.Event.associations.owner,
        {
          association: orm.Event.associations.attendees,
          through: { attributes: [] }, // exclude: 'Participation'
        },
      ],
    });

    // if managed, restrict access to owner or attendee
    if (event?.isManaged) {
      if (
        event.ownerWalletAddress !== walletAddress &&
        !(walletAddress && (await event.hasAttendee(walletAddress)))
      ) {
        return undefined;
      }
    }

    return event?.toJSON();
  }

  /**
   * Fetch a specific user from the database
   * @param walletAddress - wallet address of the user
   * @param includeEvents - include a list of events the user is attending
   * @returns - user json object
   */
  async getUser(
    walletAddress: string,
    includeEvents: boolean = false,
    allowCreation: boolean = false
  ): Promise<any | undefined> {
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

    // TODO this never returns associated events
    if (allowCreation) {
      const [user, created] = await orm.User.findOrCreate({
        ...options,
        defaults: {
          walletAddress: walletAddress,
          isOrganizer: true, // TODO change to false
          isAdmin: true, // TODO change to false
          slots: 200, // TODO change to 0
        },
      });
      return user.toJSON();
    } else {
      const user = await orm.User.findOne(options);
      return user?.toJSON();
    }
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
    const user = await orm.User.findOne({
      where: {
        walletAddress: walletAddress,
      },
      rejectOnEmpty: true,
    });
    await user.update({
      firstName,
      lastName,
      email,
    });
    await user.save();
  }

  /**
   * Fetch event slot information of a user
   * @param networkId - network identifier
   * @param walletAddress - wallet address of the user
   * @returns - currently used and max available slots
   */
  async getSlots(
    networkId: NetworkIdentifier,
    walletAddress: string
  ): Promise<[number, number]> {
    const user = await orm.User.findOne({
      where: { walletAddress: walletAddress },
    });
    if (!user) {
      throw new AttendifyError("Unable to find user");
    }

    const result = await orm.Event.findOne({
      where: {
        ...(networkId !== NetworkIdentifier.UNKNOWN
          ? { networkId: networkId }
          : {}),
        status: EventStatus.ACTIVE,
        ownerWalletAddress: walletAddress,
      },
      attributes: [[db.fn("sum", db.col("tokenCount")), "slots"]],
      raw: true,
    });
    const slots = ((result as any)?.slots as number) ?? 0;

    return [slots, user.slots];
  }

  /**
   * Fetch a list of all users
   * @param networkId - network identifier (currently ignored)
   * @returns list of user json objects
   */
  async getUsers(networkId: NetworkIdentifier): Promise<any[]> {
    const users = await orm.User.findAll({
      order: [["walletAddress", "ASC"]],
      where: {
        walletAddress: {
          [Op.notIn]: this.networkConfigs
            .filter((c) => isValidSecret(c.vaultWalletSeed))
            .map((c) => Wallet.fromSeed(c.vaultWalletSeed).classicAddress),
        },
      },
    });
    return users.map((user) => user.toJSON());
  }

  /**
   * Fetch a list of all organizers
   * @param networkId - network identifier (currently ignored)
   * @returns list of user json objects
   */
  async getOrganizers(networkId: NetworkIdentifier): Promise<any[]> {
    const users = await orm.User.findAll({
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

    // exclude vault wallet users
    const userCount = await orm.User.count({
      where: {
        walletAddress: {
          [Op.notIn]: this.networkConfigs
            .filter((c) => isValidSecret(c.vaultWalletSeed))
            .map((c) => Wallet.fromSeed(c.vaultWalletSeed).classicAddress),
        },
      },
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
    });

    const eventCount = await orm.Event.count({
      where: {
        networkId: NetworkIdentifier.TESTNET,
      },
    });

    const pendingCount = await orm.Event.count({
      where: {
        networkId: NetworkIdentifier.TESTNET,
        status: EventStatus.PENDING,
      },
    });

    const activeCount = await orm.Event.count({
      where: {
        networkId: NetworkIdentifier.TESTNET,
        status: EventStatus.ACTIVE,
      },
    });

    const finishedCount = await orm.Event.count({
      where: {
        networkId: NetworkIdentifier.TESTNET,
        status: {
          [Op.or]: [EventStatus.CANCELED, EventStatus.CLOSED],
        },
      },
    });

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
  }
}
