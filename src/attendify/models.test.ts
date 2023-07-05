import assert from "node:assert/strict";

import config from "../config";
import { NetworkIdentifier } from "../types";
import { db, User, Event } from "./models";

/* TODO 
  - test associations
  - eager loading
  - mixin methods
  - common queries
  */

describe("Test Models", () => {
  let users: User[];
  let events: Event[];

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
        })
      );
    }

    // create some events
    events = [];
    for (let i = 0; i < 3; ++i) {
      events.push(
        await users[0].createEvent({
          title: `title ${i}`,
          description: "description",
          location: "location",
          uri: "https://ipfs.io/ipfs/bafybeift74uej5vas5el2bzg7fuobe6s7bdr2s6darmbm7azXx3cwe3qe4/metadata.json",
          tokenCount: 5,
          dateStart: new Date(),
          dateEnd: new Date(),
          networkId: NetworkIdentifier.TESTNET,
          isManaged: false,
        })
      );
    }
  });

  test("create user", async () => {
    const user = await User.create({
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      isOrganizer: true,
    });
  });

  test("create event", async () => {
    const user = users[1];
    const event = await Event.create({
      title: "title",
      description: "description",
      location: "location",
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
      title: "title",
      description: "description",
      location: "location",
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
});
