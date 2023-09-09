import assert from "node:assert/strict";

import { ValidationError } from "sequelize";

import config from "../config";
import { EventStatus, NetworkIdentifier } from "../types";
import { db, User, Event, Accounting, NFT, Claim } from "./models";

describe("Test Models", () => {
  let users: User[];
  let events: Event[];
  let nfts: NFT[];

  beforeAll(async () => {
    assert(config.isTesting); // safety to ensure we don't wipe an existing db
    await db.authenticate();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // wipe db
    await db.sync({ force: true });

    // create some users
    users = [];
    for (let i = 0; i < 5; ++i) {
      users.push(
        await User.create({
          walletAddress: `0x${i}`,
          isOrganizer: true,
          isAdmin: false,
        })
      );
    }

    // create some events
    events = [];
    for (let i = 0; i < 3; ++i) {
      events.push(
        await users[0].createEvent({
          status: EventStatus.ACTIVE,
          title: `title ${i}`,
          description: "description",
          location: "location",
          imageUrl:
            "https://images.unsplash.com/photo-1686742745949-bf6603f74866",
          uri: "https://ipfs.io/ipfs/bafybeift74uej5vas5el2bzg7fuobe6s7bdr2s6darmbm7azXx3cwe3qe4/metadata.json",
          tokenCount: 5,
          dateStart: new Date(),
          dateEnd: new Date(),
          networkId: NetworkIdentifier.TESTNET,
          isManaged: false,
        })
      );
    }

    // create some nfts
    nfts = [];
    for (let i = 0; i < 3; ++i) {
      nfts.push(
        await NFT.create({
          id: `0x${i}`,
          issuerWalletAddress: users[i].walletAddress,
          eventId: events[0].id,
        })
      );
    }
  });

  test("create user", async () => {
    const user = await User.create({
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      isOrganizer: true,
      isAdmin: false,
    });
  });

  test("create accounting", async () => {
    const event = events[0];
    const accounting = await Accounting.create({
      depositAddress: "rnuxRbi8CKBAKge22JdUsmmQ3MHMw5gCuD",
      depositReserveValue: 500,
      depositFeeValue: 0,
      accumulatedTxFees: 0,
      eventId: event.id,
    });

    const eventLoaded = await Event.findByPk(event.id, {
      include: [Event.associations.accounting],
    });
    expect(eventLoaded?.accounting).not.toBeUndefined();

    const accountingLoaded = await Accounting.findByPk(accounting.id, {
      include: [Accounting.associations.event],
    });
    expect(accountingLoaded?.event).not.toBeUndefined();
  });

  test("create accounting uniqueness", async () => {
    const create = async () => {
      await Accounting.create({
        depositAddress: "rnuxRbi8CKBAKge22JdUsmmQ3MHMw5gCuD",
        depositReserveValue: 500,
        depositFeeValue: 0,
        accumulatedTxFees: 0,
        eventId: events[0].id,
      });
    };

    // second call should throw
    await create();
    await expect(create).rejects.toThrow(ValidationError);
  });

  test("create event", async () => {
    const user = users[1];
    const event = await Event.create({
      status: EventStatus.ACTIVE,
      title: "title",
      description: "description",
      location: "location",
      imageUrl: "https://images.unsplash.com/photo-1686742745949-bf6603f74866",
      uri: "https://ipfs.io/ipfs/bafybeift74uej5vas5el2bzg7fuobe6s7bdr2s6darmbm7azXx3cwe3qe4/metadata.json",
      tokenCount: 5,
      dateStart: new Date(),
      dateEnd: new Date(),
      networkId: NetworkIdentifier.TESTNET,
      isManaged: false,
      ownerWalletAddress: user.walletAddress,
    });

    // load associations (eager)
    const userLoaded = await User.findByPk(user.walletAddress, {
      include: [User.associations.events],
    });

    expect(userLoaded?.events).not.toBeUndefined();
    expect(userLoaded?.events?.length).toBe(1);

    const eventLoaded = await Event.findByPk(event.id, {
      include: [Event.associations.owner],
    });

    expect(eventLoaded?.owner).not.toBeUndefined();
  });

  test("create user event", async () => {
    const user = users[1];
    const event = await user.createEvent({
      status: EventStatus.ACTIVE,
      title: "title",
      description: "description",
      location: "location",
      imageUrl: "https://images.unsplash.com/photo-1686742745949-bf6603f74866",
      uri: "https://ipfs.io/ipfs/bafybeift74uej5vas5el2bzg7fuobe6s7bdr2s6darmbm7azXx3cwe3qe4/metadata.json",
      tokenCount: 5,
      dateStart: new Date(),
      dateEnd: new Date(),
      networkId: NetworkIdentifier.TESTNET,
      isManaged: false,
    });

    expect(event.owner).toBeUndefined(); // no eager loading
    expect(await user.hasEvent(event)).toBe(true);
    expect(await user.hasEvent(event.id)).toBe(true);
    expect(await user.countEvents()).toBe(1);
  });

  test("event create accounting", async () => {
    const event = events[0];
    await event.createAccounting({
      depositAddress: "rnuxRbi8CKBAKge22JdUsmmQ3MHMw5gCuD",
      depositReserveValue: 10 * 1000000,
      depositFeeValue: 1000000,
      accumulatedTxFees: 0,
    });

    const eventLoaded = await Event.findByPk(event.id, {
      include: [Event.associations.accounting],
    });
    expect(eventLoaded?.accounting).not.toBeUndefined();
  });

  test("event add/remove attendee", async () => {
    // add attendees
    await events[0].addAttendee(users[1]);
    await events[0].addAttendee(users[2]);
    await events[1].addAttendee(users[1]);
    await events[1].addAttendee(users[3]);
    await events[1].addAttendee(users[4]);
    await events[1].addAttendee(users[4]); // double add attendee (no op)
    await events[2].addAttendee(users[1]);
    await events[2].addAttendee(users[2]);
    await events[2].addAttendee(users[4]);

    expect(await events[0].countAttendees()).toBe(2);
    expect(await events[1].countAttendees()).toBe(3);
    expect(await events[2].countAttendees()).toBe(3);

    const expectedAttendances = [0, 3, 2, 1, 2];
    expect(users.length).toBe(expectedAttendances.length);
    for (let i = 0; i < users.length; ++i) {
      const attendances = await users[i].getAttendances();
      expect(expectedAttendances[i]).toBe(attendances.length);
      expect(expectedAttendances[i]).toBe(await users[i].countAttendances());
    }

    expect(await events[0].hasAttendee(users[0])).toBe(false);
    expect(await events[0].hasAttendee(users[1])).toBe(true);
    expect(await events[0].hasAttendee(users[2])).toBe(true);
    expect(await events[0].hasAttendee(users[3])).toBe(false);
    expect(await events[0].hasAttendee(users[4])).toBe(false);

    expect(await events[1].hasAttendee(users[0])).toBe(false);
    expect(await events[1].hasAttendee(users[1])).toBe(true);
    expect(await events[1].hasAttendee(users[2])).toBe(false);
    expect(await events[1].hasAttendee(users[3])).toBe(true);
    expect(await events[1].hasAttendee(users[4])).toBe(true);

    // remove attendee
    await events[0].removeAttendee(users[1]);
    expect(await events[0].countAttendees()).toBe(1);
    expect(await events[0].hasAttendee(users[1])).toBe(false);
    expect(await users[1].hasAttendance(events[0])).toBe(false);
  });

  test("event create nft", async () => {
    const user = users[1];
    const event = events[1];
    await event.createNft({
      id: "00010000A74A340A8194E373F830125A179E1AD50BCDC473542E1AAA00000110",
      issuerWalletAddress: user.walletAddress,
    });

    const eventLoaded = await Event.findByPk(event.id, {
      include: [Event.associations.nfts],
    });
    expect(eventLoaded?.nfts).not.toBeUndefined();
    expect(eventLoaded?.nfts?.length).toBe(1);
  });

  test("create nft", async () => {
    const user = users[1];
    const event = events[1];
    const nft = await NFT.create({
      id: "00010000A74A340A8194E373F830125A179E1AD50BCDC473542E1AAA00000110",
      issuerWalletAddress: user.walletAddress,
      eventId: event.id,
    });

    expect(await event.countNfts()).toBe(1);
    expect(await event.hasNft(nft.id)).toBe(true);

    const eventLoaded = await Event.findByPk(event.id, {
      include: [Event.associations.nfts],
    });
    expect(eventLoaded?.nfts).not.toBeUndefined();
    expect(eventLoaded?.nfts?.length).toBe(1);

    const nftLoaded = await NFT.findByPk(nft.id, {
      include: [NFT.associations.event],
    });
    expect(nftLoaded?.event).not.toBeUndefined();
  });

  test("query nft without claim", async () => {
    // create a claim for one of the tokens
    const claim = await users[1].createClaim({
      tokenId: nfts[0].id,
      offerIndex:
        "A652B4BB31F310C502264B01C284FF727E2645020F0B94F287A29B68A70543DF",
      claimed: false,
    });

    const results = await NFT.findAll({
      where: {
        eventId: events[0].id,
      },
      include: [
        {
          association: NFT.associations.claim,
          required: false,
          attributes: ["id"],
        },
      ],
    });

    expect(results.find((x) => x.claim !== null)?.id).toBe(claim.tokenId);
    expect(results.filter((x) => x.claim === null).length).toBe(nfts.length - 1);
  });

  test("create claim", async () => {
    const user = users[1];
    const nft = nfts[0];
    const claim = await Claim.create({
      ownerWalletAddress: user.walletAddress,
      tokenId: nft.id,
      offerIndex:
        "A652B4BB31F310C502264B01C284FF727E2645020F0B94F287A29B68A70543DF",
      claimed: false,
    });

    const nftLoaded = await NFT.findByPk(nft.id, {
      include: [NFT.associations.claim],
    });
    expect(nftLoaded?.claim).not.toBeUndefined();

    const claimLoaded = await Claim.findByPk(claim.id, {
      include: [Claim.associations.token],
    });
    expect(claimLoaded?.token).not.toBeUndefined();
  });

  test("create claim uniqueness", async () => {
    const create = async () => {
      await Claim.create({
        ownerWalletAddress: users[1].walletAddress,
        tokenId: nfts[0].id,
        offerIndex:
          "A652B4BB31F310C502264B01C284FF727E2645020F0B94F287A29B68A70543DF",
        claimed: false,
      });
    };

    // second call should throw
    await create();
    await expect(create).rejects.toThrow(ValidationError);
  });
});
