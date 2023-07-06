import {
  AccountObjectsResponse,
  Client,
  convertStringToHex,
  isValidSecret,
  LedgerEntry,
  NFTokenCreateOffer,
  NFTokenCreateOfferFlags,
  NFTokenMintFlags,
  RippledError,
  TransactionMetadata,
  Wallet,
} from "xrpl";
import type { CreatedNode } from "xrpl/dist/npm/models/transactions/metadata";
import type { NFTOffer } from "xrpl/dist/npm/models/common";

import { AttendifyError } from "./error";
import { db, orm } from "./models";
import { Metadata, NetworkIdentifier, NetworkConfig } from "../types";

const DEFAULT_TICKET_RESERVE = 2; // XRP

/**
 * Attendify is API library for proof of attendance infrastructure on XRPL
 * It allows for creation of new claim events, checking whether claim is possible,
 * claiming, verifying NFT ownership, and fetching list of participants for a particular event
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
  private getNetworkConfig(networkId: NetworkIdentifier): [Client, Wallet] {
    const config = this.networkConfigs.find((obj: NetworkConfig) => {
      return obj.networkId === networkId;
    });

    if (!config || !isValidSecret(config.vaultWalletSeed)) {
      throw new AttendifyError("Network not supported");
    }
    return [new Client(config.url), Wallet.fromSeed(config.vaultWalletSeed)];
  }

  /**
   *
   * @param {string} walletAddress - The address of the participant's wallet
   * @returns true if account was found on selected network or false if it wasn't
   */
  private async checkIfAccountExists(
    networkId: NetworkIdentifier,
    walletAddress: string
  ): Promise<boolean> {
    try {
      const [client, wallet] = this.getNetworkConfig(networkId);
      await client.connect();
      const tx = await client.getBalances(walletAddress);
      await client.disconnect();
      console.log(tx);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  /**
   * Checks for all NFTs owned by a particular address
   * @param {string} address - The wallet address to check
   * @param {number} [taxon] - An optional parameter used to filter the NFTs by taxon
   * @returns {object[]} - An array of NFTs owned by the given address. If no NFTs are found, returns an empty array
   */
  // TODO cache NFTs to avoid having to query them on each request
  async getBatchNFTokens(
    networkId: NetworkIdentifier,
    address: string,
    taxon: number
  ) {
    const [client, wallet] = this.getNetworkConfig(networkId);
    try {
      if ((await this.checkIfAccountExists(networkId, address)) == false)
        throw new Error(`Account from request was not found on XRPL`);
      await client.connect();
      let nfts = await client.request({
        command: "account_nfts",
        account: address,
      });
      let accountNfts = nfts.result.account_nfts;
      //console.log("Found ", accountNfts.length, " NFTs in account ", address);
      while (true) {
        if (nfts["result"]["marker"] === undefined) {
          break;
        } else {
          nfts = await client.request({
            command: "account_nfts",
            account: address,
            marker: nfts["result"]["marker"],
          });
          accountNfts = accountNfts.concat(nfts.result.account_nfts);
        }
      }
      client.disconnect();
      if (taxon) return accountNfts.filter((a: any) => a.NFTokenTaxon == taxon);
      return accountNfts;
    } catch (error) {
      console.error(error);
    }
    return [];
  }

  /**
   * Creates a sell offer for NFT from selected event
   * The offer has to be accepted by the buyer once it was returned
   * * In current design checks to see whether or not there are still any NFTs
   * * to claim are done outside of this class in related API route
   * @ToDo Whitelist system to only allow claiming from certain adresses
   * @ToDo Deadline system where NFTs can only be claimed before the event ends
   * @ToDo Return previously created offer for user that's already event participant
   * @param {string} buyer - wallet address of user trying to claim NFT
   * @param {string} tokenId - ID for NFT that should be claimed
   * @returns {object} - The metadata of the sell offer for a given NFT from selected event
   * @throws {Error} - If any of the required parameters are missing or if there is an issue creating the sell offer
   */
  private async createSellOffer(
    networkId: NetworkIdentifier,
    walletAddress: string,
    tokenId: string
  ) {
    if (!(await this.checkIfAccountExists(networkId, walletAddress))) {
      throw new AttendifyError("Account from not found on XRPL");
    }
    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    // Preparing transaction data
    const transactionBlob: NFTokenCreateOffer = {
      TransactionType: "NFTokenCreateOffer",
      Account: wallet.classicAddress,
      NFTokenID: tokenId,
      Amount: "0",
      Flags: NFTokenCreateOfferFlags.tfSellNFToken,
      Destination: walletAddress,
    };
    // Submitting transaction to XRPL
    const tx = await client.submitAndWait(transactionBlob, {
      wallet: wallet,
    });
    console.log("tx create offer", tx);
    // TODO is it really necessary to do that ? Cant we get the offer index elsewhere, from tx?
    // TODO this can throw, if there are no offers
    const nftSellOffers = await client.request({
      command: "nft_sell_offers",
      nft_id: tokenId,
    });
    client.disconnect();
    // Getting details of sell offer for buyer wallet address
    return nftSellOffers.result.offers.find((obj: any) => {
      return obj.destination === walletAddress;
    });
  }

  /**
   * Adds a participant to an existing event
   * @param eventId - The ID of the event
   * @param walletAddress - The address of the participant's wallet
   * @param createOffer - Create an NFT sell offer
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
    if ((await event.countAttendees()) >= event.tokenCount) {
      throw new AttendifyError("Event already full");
    }
    if (await event.hasAttendee(walletAddress)) {
      throw new AttendifyError("User is already a participant");
    }
    if (checkIsManaged && event.isManaged) {
      throw new AttendifyError("Not allowed to join private event");
    }

    const user = await orm.User.findOne({
      where: { walletAddress: walletAddress },
    });
    if (!user) {
      throw new AttendifyError("Unable to find user");
    }

    // find an available NFT
    const [client, wallet] = this.getNetworkConfig(event.networkId);
    const issuerWalletAddress = wallet.classicAddress;

    // TODO rework available NFT lookup
    const claimableTokens = await this.getBatchNFTokens(
      event.networkId,
      issuerWalletAddress,
      eventId
    );
    if (claimableTokens.length == 0) {
      // Note: this should never happen unless db is out of sync
      throw new AttendifyError("No more available slots");
    }

    // TODO workaround: db entries should be created when minting the NFTs
    // create new NFT entries, if they don't exist in db
    for (const claimableToken of claimableTokens) {
      if (!(await event.hasNft(claimableToken.NFTokenID))) {
        await event.createNft({
          id: claimableToken.NFTokenID,
          issuerWalletAddress: issuerWalletAddress,
        });
      }
    }

    // pick an NFT that has not been assigned to a claim
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

    let offer: NFTOffer | undefined;
    if (createOffer) {
      offer = await this.createSellOffer(
        event.networkId,
        walletAddress,
        nft.id
      );
      if (!offer) {
        throw new AttendifyError("Unable to create sell offer");
      }
    }

    // add the participant
    await event.addAttendee(user);

    const claim = await user.createClaim({
      tokenId: nft.id,
      offerIndex: offer ? offer.nft_offer_index : null,
      claimed: false,
    });

    return claim.toJSON();
  }

  /**
   * Adds several participants to an existing event
   * @param eventId - The ID of the event
   * @param walletAddress - requesting wallet address
   * @param attendeeWalletAddresses - The wallet addresses of the participants
   * @param createOffer - Create an NFT sell offer
   */
  async addParticipants(
    eventId: number,
    walletAddress: string,
    attendeeWalletAddresses: string[],
    createOffer: boolean
  ) {
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
   * Check if a particular NFT sell offer exists
   * @param networkId - XRP network identifier
   * @param tokenId - NFT token ID
   * @param offerIndex - NFT token sell offer index
   * @returns true, if sell offer exists
   */
  private async checkSellOffer(
    networkId: NetworkIdentifier,
    tokenId: string,
    offerIndex: string
  ): Promise<boolean> {
    const [client, wallet] = this.getNetworkConfig(networkId);
    try {
      // Note: this throws, if there are no offers
      await client.connect();
      const offerInfo = await client.request({
        command: "nft_sell_offers",
        nft_id: tokenId,
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
   * Finds an existing NFT sell offer or creates a new one for the given event claim
   * The offer has to be accepted by the buyer once it was returned
   * @param walletAddress - wallet address of user trying to claim NFT
   * @param eventId - The event identifier
   * @returns claim object
   */
  async getClaim(walletAddress: string, eventId: number): Promise<any> {
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
      throw new AttendifyError("Unable to find Claim");
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
        const offer = await this.createSellOffer(
          networkId,
          walletAddress,
          claim.token.id
        );
        if (!offer) {
          throw new AttendifyError("Unable to create sell offer");
        }
        claim.offerIndex = offer.nft_offer_index;
        await claim.save();
      }
    }

    return claim.toJSON();
  }

  /**
   * Prepare ledger Ticket objects for NFT batch minting
   * @param networkId - network identifier
   * @param target - number of tickets that should be set up
   * @returns an array of at least `target` ticket sequence numbers
   */
  private async prepareTickets(
    networkId: NetworkIdentifier,
    target: number
  ): Promise<number[]> {
    console.debug(`Preparing ${target} tickets`);
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
          type: "ticket",
          limit: 10, // TODO
          marker: res ? res.result.marker : undefined,
        });
        tickets.push(...(res.result.account_objects as LedgerEntry.Ticket[]));
      } while (res.result.marker);
      console.debug(`Found ${tickets.length} existing tickets`);

      // determine the number of new tickets needed
      const ticketSequences = tickets.map((t) => t.TicketSequence);
      const ticketCount = target - ticketSequences.length;
      if (ticketCount <= 0) {
        return ticketSequences;
      }

      // prepare to create additional tickets
      const balance = parseFloat(await client.getXrpBalance(wallet.address));

      const state = await client.request({
        command: "server_info",
      });
      const reserve =
        state.result.info.validated_ledger?.reserve_base_xrp ??
        DEFAULT_TICKET_RESERVE;

      if (ticketCount > Math.floor(balance - 1 / reserve)) {
        throw new AttendifyError(
          "Insufficient balance to cover owner reserves"
        );
      }

      // create new tickets
      console.debug(`Creating ${ticketCount} new tickets`);
      const tx = await client.submitAndWait(
        {
          TransactionType: "TicketCreate",
          Account: wallet.address,
          TicketCount: ticketCount,
        },
        {
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
   * Create a new event and premint NFTs
   * @param networkId - network identifier
   * @param walletAddress - event owner wallet address
   * @param metadata - event information/details
   * @param uri - IPFS url with metadata for NFT
   * @param isManaged - event signup permissions
   * @returns new event id
   */
  async createEvent(
    networkId: NetworkIdentifier,
    walletAddress: string,
    metadata: Metadata,
    uri: string,
    isManaged: boolean
  ) {
    if (!(await this.checkIfAccountExists(networkId, walletAddress))) {
      throw new AttendifyError("Unable to find account on XRPL");
    }

    const owner = await orm.User.findOne({
      where: { walletAddress: walletAddress },
    });
    if (!owner) {
      throw new AttendifyError("Unable to find user");
    }
    
    const eventId = this.nextEventId;
    const tokenCount = metadata.tokenCount;

    console.debug(`Batch minting ${tokenCount} NFTs`);
    const ticketSequences = await this.prepareTickets(networkId, tokenCount);

    const [client, wallet] = this.getNetworkConfig(networkId);
    await client.connect();
    try {
      // batch mint NFTs
      const txHashes: Array<string | undefined> = [];
      for (let i = 0; i < tokenCount; ++i) {
        console.debug(`Minting NFT ${i + 1}/${tokenCount}`);
        const tx = await client.submit(
          {
            TransactionType: "NFTokenMint",
            Account: wallet.classicAddress,
            URI: convertStringToHex(uri),
            Flags:
              NFTokenMintFlags.tfBurnable | NFTokenMintFlags.tfTransferable,
            TransferFee: 0,
            Sequence: 0,
            TicketSequence: ticketSequences[i],
            NFTokenTaxon: eventId,
          },
          {
            wallet: wallet,
          }
        );
        txHashes.push(tx.result.tx_json.hash);
      }

      // TODO ensure all transactions succeeded before creating db entries

      const event = await owner.createEvent({
        id: eventId,
        networkId: networkId,
        title: metadata.title,
        description: metadata.description,
        location: metadata.location,
        tokenCount: tokenCount,
        uri: uri,
        dateStart: metadata.dateStart,
        dateEnd: metadata.dateEnd,
        isManaged: isManaged,
      });

      // increment next event id
      this.nextEventId++;

      // TODO add NFTs to database

      return event.id;
    } finally {
      client.disconnect();
    }
  }

  /**
   * Fetch a list of public events from the database
   * @param {number} limit - maximum number of returned results
   * @param {boolean} includeAttendees - include list of attendees for each event
   * @returns {object} result - An object with a list of events
   */
  async getEventsPublic(
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
        isManaged: false,
      },
    });
    return events.map((event) => event.toJSON());
  }

  async getEventsOwned(
    networkId: NetworkIdentifier,
    walletAddress: string,
    limit: number = 100,
    includeAttendees: boolean = false
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
        orm.Event.associations.owner,
        ...(includeAttendees
          ? [
              {
                association: orm.Event.associations.attendees,
                through: { attributes: [] }, // exclude: 'Participation'
              },
            ]
          : []),
      ],
    });
    return events.map((event) => event.toJSON());
  }

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
   * @param eventId - ID of the event
   * @param walletAddress - optional request wallet address, restrict access to owner and attendee, if event is managed
   * @returns {object} result - An object with a list of events
   */
  async getEvent(
    eventId: number,
    walletAddress?: string // TODO filter results depending on access level
  ): Promise<any | undefined> {
    const includeAttendees = true; // TODO
    const event = await orm.Event.findOne({
      where: { id: eventId },
      // attributes: {
      //   exclude: ["date", "ownerWalletAddress"],
      // },
      include: [
        orm.Event.associations.owner,
        ...(includeAttendees
          ? [
              {
                association: orm.Event.associations.attendees,
                through: { attributes: [] }, // exclude: 'Participation'
              },
            ]
          : []),
      ],
    });

    // TODO if managed, restrict access

    return event?.toJSON();
  }

  /**
   * Fetch a specific user from the database
   * @param walletAddress - wallet address of the user
   * @param includeEvents - include list of events the user is attending
   * @returns - A user json object
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

    if (allowCreation) {
      const [user, created] = await orm.User.findOrCreate({
        ...options,
        defaults: {
          walletAddress: walletAddress,
          isOrganizer: true, // TODO change to false
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
   * @returns nothing
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
}
