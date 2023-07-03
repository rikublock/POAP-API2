import {
  Client,
  convertHexToString,
  convertStringToHex,
  decode,
  NFTokenCreateOffer,
  NFTokenCreateOfferFlags,
  NFTokenMint,
  NFTokenMintFlags,
  parseNFTokenID,
  RippledError,
  Wallet,
} from "xrpl";
import { NFTOffer } from "xrpl/dist/npm/models/common";

import { AttendifyError } from "./error";
import { db, orm } from "./models";
import { Metadata, NetworkIdentifier, NetworkConfig } from "../types";

/**
 * Attendify is API library for proof of attendance infrastructure on XRPL
 * It allows for creation of new claim events, checking whether claim is possible,
 * claiming, verifying NFT ownership, and fetching list of participants for a particular event
 */
export class Attendify {
  nextEventId: number;
  networkConfigs: NetworkConfig[];

  /**
   * Initializes a new instance of the Attendify class
   */
  constructor(networkConfigs: NetworkConfig[], nextEventId: number = 0) {
    // Initializes the next event ID
    this.nextEventId = nextEventId;
    this.networkConfigs = networkConfigs;
  }

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
      if (config.vaultWalletSeed.length > 0) {
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

  private getNetworkConfig(networkId: NetworkIdentifier): NetworkConfig {
    const config = this.networkConfigs.find((obj: NetworkConfig) => {
      return obj.networkId === networkId;
    });

    if (!config) {
      throw new AttendifyError("Invalid network identifier");
    }
    return config;
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
      const config = this.getNetworkConfig(networkId);
      const client = new Client(config.url);
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
   * Adds a new event to the database
   * @param {string} ownerAddress - The address of the event owner's wallet
   * @param {number} eventId - The ID of the event
   * @param {string} title - Title of the event
   * @param {string} uri - Metadata URI
   * @param {Date} dateStart - Start date of the event
   * @param {Date} dateEnd - End date of the event
   * @param {number} count - Number of available event slots
   * @returns {boolean} - `true` if the operation was successful, `false` otherwise
   */
  private async addEvent(
    eventId: number,
    networkId: NetworkIdentifier,
    ownerAddress: string,
    title: string,
    description: string,
    location: string,
    tokenCount: number,
    uri: string,
    dateStart: Date,
    dateEnd: Date,
    isManaged: boolean
  ) {
    const [owner, created] = await orm.User.findOrCreate({
      where: { walletAddress: ownerAddress },
    });
    const event = await owner.createEvent({
      id: eventId,
      networkId: networkId,
      title: title,
      description: description,
      location: location,
      tokenCount: tokenCount,
      uri: uri,
      dateStart: dateStart,
      dateEnd: dateEnd,
      isManaged: isManaged,
    });
    return event;
  }

  /**
   * Adds a minted NFT to an event in the database
   * @param issuerAddress - The address of the NFT issuer's wallet
   * @param eventId - The ID of the event
   * @param tokenId - The identifier of the NFT (hash)
   * @returns true if successful
   */
  private async addNFT(
    issuerAddress: string,
    eventId: number,
    tokenId: string
  ): Promise<boolean> {
    try {
      const event = await orm.Event.findOne({
        where: { id: eventId },
        rejectOnEmpty: true,
      });
      const [user, created] = await orm.User.findOrCreate({
        where: { walletAddress: issuerAddress },
      });
      await event.createNft({
        id: tokenId,
        issuerWalletAddress: user.walletAddress,
      });
      return true;
    } catch (error) {
      console.log(error);
    }
    return false;
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
    const config = this.getNetworkConfig(networkId);
    try {
      if ((await this.checkIfAccountExists(networkId, address)) == false)
        throw new Error(`Account from request was not found on XRPL`);
      const client = new Client(config.url);
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

    const config = this.getNetworkConfig(networkId);
    const seller = Wallet.fromSeed(config.vaultWalletSeed);
    const client = new Client(config.url);
    await client.connect();
    // Preparing transaction data
    const transactionBlob: NFTokenCreateOffer = {
      TransactionType: "NFTokenCreateOffer",
      Account: seller.classicAddress,
      NFTokenID: tokenId,
      Amount: "0",
      Flags: NFTokenCreateOfferFlags.tfSellNFToken,
      Destination: walletAddress,
    };
    // Submitting transaction to XRPL
    const tx = await client.submitAndWait(transactionBlob, {
      wallet: seller,
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
    const config = this.getNetworkConfig(event.networkId);
    const issuerWalletAddress = Wallet.fromSeed(
      config.vaultWalletSeed
    ).classicAddress;

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
   * @param networkId XRP network identifier
   * @param tokenId NFT token ID
   * @param offerIndex NFT token sell offer index
   * @returns true, if sell offer exists
   */
  private async checkSellOffer(
    networkId: NetworkIdentifier,
    tokenId: string,
    offerIndex: string
  ): Promise<boolean> {
    const config = this.getNetworkConfig(networkId);
    const client = new Client(config.url);
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
   * Retrieves a list of all tickets owned by a particular address
   * @param {string} walletAddress - The wallet address to check
   * @param {object} client - The XRPL client to use for the request
   * @returns {object[]} - An array of tickets owned by the given address. If no tickets are found, returns an empty array
   */
  async getAccountTickets(walletAddress: string, client: any) {
    let res = await client.request({
      command: "account_objects",
      account: walletAddress,
      type: "ticket",
    });
    const resTickets = res.result.account_objects;
    while (true) {
      console.log("marker, ", res["result"]["marker"]);
      if (res["result"]["marker"] === undefined) {
        return resTickets;
      }
      res = await client.request({
        method: "account_objects",
        account: walletAddress,
        type: "ticket",
        marker: res["result"]["marker"],
      });
      console.log(res.result.account_objects.length);
      return resTickets.concat(res.result.account_objects);
    }
  }

  /**
   * Mints NFTs for created event
   * @param networkId - network identifier, e.g. mainnet
   * @param walletAddress - Account of user requesting creation of event
   * @param metadata - event information
   * @param uri - IPFS url with metadata for NFT
   * @param isManaged - event signup permissions
   * @returns New event id
   */
  async batchMint(
    networkId: NetworkIdentifier,
    walletAddress: string,
    metadata: Metadata,
    uri: string,
    isManaged: boolean
  ) {
    const config = this.getNetworkConfig(networkId);
    try {
      const curentEventId = this.nextEventId;
      if ((await this.checkIfAccountExists(networkId, walletAddress)) == false)
        throw new Error(`Account from request was not found om XRPL`);
      const client = new Client(config.url);
      await client.connect();
      const vaultWallet = Wallet.fromSeed(config.vaultWalletSeed);
      const nftokenCount = metadata.tokenCount;
      let remainingTokensBeforeTicketing = nftokenCount;
      for (let currentTickets; remainingTokensBeforeTicketing != 0; ) {
        let maxTickets =
          250 -
          (await this.getAccountTickets(vaultWallet.address, client)).length;
        console.log("Max tickets", maxTickets);
        if (maxTickets == 0)
          throw new Error(
            `The minter has maximum allowed number of tickets at the moment. Please try again later, remove tickets that are not needed or use different minter account.`
          );
        const balanceForTickets = Math.floor(
          (parseFloat(await client.getXrpBalance(vaultWallet.address)) - 1) / 2
        );
        if (balanceForTickets < maxTickets) maxTickets = balanceForTickets;
        if (remainingTokensBeforeTicketing > maxTickets) {
          currentTickets = maxTickets;
        } else {
          currentTickets = remainingTokensBeforeTicketing;
        }
        // Get account information, particularly the Sequence number.
        const account_info = await client.request({
          command: "account_info",
          account: vaultWallet.address,
        });
        const my_sequence = account_info.result.account_data.Sequence;
        // Create the transaction hash.
        const ticketTransaction = await client.autofill({
          TransactionType: "TicketCreate",
          Account: vaultWallet.address,
          TicketCount: currentTickets,
          Sequence: my_sequence,
        });
        // Sign the transaction.
        const signedTransaction = vaultWallet.sign(ticketTransaction);
        // Submit the transaction and wait for the result.
        const tx = await client.submitAndWait(signedTransaction.tx_blob);
        const resTickets = await this.getAccountTickets(
          vaultWallet.address,
          client
        );
        // Populate the tickets array variable.
        const tickets: any[] = [];
        for (let i = 0; i < currentTickets; i++) {
          //console.log({ index: i, res: resTickets[i] });
          tickets[i] = resTickets[i].TicketSequence;
        }
        // Mint NFTokens
        const txHashes = [];
        for (let i = 0; i < currentTickets; i++) {
          console.log(
            "minting ",
            i + 1 + (nftokenCount - remainingTokensBeforeTicketing),
            "/",
            nftokenCount,
            " NFTs"
          );
          const transactionBlob: NFTokenMint = {
            TransactionType: "NFTokenMint",
            Account: vaultWallet.classicAddress,
            URI: convertStringToHex(uri),
            Flags: NFTokenMintFlags.tfTransferable,
            /*{
              tfBurnable: true,
              tfTransferable: true,
            },*/
            TransferFee: 0,
            Sequence: 0,
            TicketSequence: tickets[i],
            NFTokenTaxon: curentEventId,
          };
          // Submit signed blob.
          const tx = await client.submit(transactionBlob, {
            wallet: vaultWallet,
          });
          txHashes.push(tx.result.tx_json.hash);
        }
        remainingTokensBeforeTicketing -= currentTickets;
      }
      // TODO ensure all transactions succeeded
      // TODO add NFTs to database

      client.disconnect();

      await this.addEvent(
        curentEventId,
        networkId,
        walletAddress,
        metadata.title,
        metadata.description,
        metadata.location,
        metadata.tokenCount,
        uri,
        metadata.dateStart,
        metadata.dateEnd,
        isManaged
      );
      this.nextEventId++;

      return curentEventId;
    } catch (error) {
      console.error(error);
      throw error;
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
          isOrganizer: false,
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
