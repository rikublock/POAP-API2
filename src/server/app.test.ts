import assert from "node:assert/strict";

import { HttpStatusCode } from "axios";
import type { Express } from "express";
import request from "supertest";
import { Client, Wallet } from "xrpl";

import config from "../config";
import { NetworkIdentifier, type NetworkConfig } from "../types";
import { Attendify } from "../attendify/attendify";
import { db } from "../attendify/models";

import { setup } from "./app";
import { generateToken } from "./auth";
import { ServerError } from "./error";

describe("express API", () => {
  let lib: Attendify;
  let app: Express;
  const wallet = Wallet.fromSeed("sEd7Rv3fXNBqiZ2mn7d6mtFdgTs8Nuy"); // r93KCca6YcwznvSrpGPpMeLSdxD3tA1k4L
  const networkConfig: NetworkConfig = {
    networkId: NetworkIdentifier.TESTNET,
    url: "wss://s.altnet.rippletest.net:51233/",
    vaultWalletSeed: "sEdSomDNjRj49LvW1WwC947K9HVGTaE", // rwMUTs7ivXLVceiWFqXKSuujK84pvYXPgZ
  };
  const timeout = 60000;

  const PermissionError = new ServerError(
    HttpStatusCode.Forbidden,
    "Permission denied"
  );

  beforeAll(async () => {
    assert(config.isTesting); // safety to ensure we don't wipe an existing db

    lib = new Attendify([networkConfig], 5);
    await lib.init();
    app = await setup(lib);
  });

  beforeEach(async () => {
    // wipe db
    await db.sync({ force: true });
  });

  test(
    "GET /auth/heartbeat",
    async () => {
      const response = await request(app).get("/auth/heartbeat");

      expect(response.statusCode).toBe(HttpStatusCode.Ok);
      expect(response.body).toEqual({ result: true });
    },
    timeout
  );

  test(
    "POST /auth/refresh",
    async () => {
      const token = await generateToken(wallet.classicAddress, [], true);
      const response = await request(app)
        .post("/auth/refresh")
        .set("Authorization", `Bearer ${token}`);

      expect(response.statusCode).toBe(HttpStatusCode.Ok);
      expect(typeof response.body.result).toBe("string");
    },
    timeout
  );

  test(
    "POST /event/create",
    async () => {
      // create user db entry
      await lib.getUser(wallet.classicAddress, true, true, true);

      const token = await generateToken(
        wallet.classicAddress,
        ["organizer"],
        true
      );
      const response = await request(app)
        .post("/event/create")
        .set("Authorization", `Bearer ${token}`)
        .send({
          networkId: networkConfig.networkId,
          title: "A title",
          description: "An even better description",
          location: "By the lake",
          imageUrl: "https://github.com",
          tokenCount: 8,
          dateStart: new Date(),
          dateEnd: new Date(),
          isManaged: false,
        });

      expect(response.statusCode).toBe(HttpStatusCode.Ok);
      expect(response.body).toEqual({ result: { eventId: 1 } });
    },
    timeout
  );

  test(
    "GET /user/info",
    async () => {
      // create user db entry
      await lib.getUser(wallet.classicAddress, true, true, true);

      const token = await generateToken(wallet.classicAddress, ["organizer"]);
      const response = await request(app)
        .get("/user/info")
        .set("Authorization", `Bearer ${token}`);

      expect(response.statusCode).toBe(HttpStatusCode.Ok);
      expect(response.body).toEqual({
        result: {
          walletAddress: wallet.classicAddress,
          firstName: null,
          lastName: null,
          email: null,
          isOrganizer: true,
          isAdmin: false,
        },
      });
    },
    timeout
  );

  test(
    "GET /user/info - unauthorized",
    async () => {
      const response = await request(app).get("/user/info");

      expect(response.statusCode).toBe(HttpStatusCode.Unauthorized);
      expect(response.body.result).toBe(null);
      expect(response.body.error).toBeDefined();
    },
    timeout
  );

  test(
    "POST /payment/check",
    async () => {
      // create user db entry
      await lib.getUser(wallet.classicAddress, true, true, true);

      // create event db entry
      const eventId = await lib.createEvent(
        networkConfig.networkId,
        wallet.classicAddress,
        {
          title: "A title",
          description: "An even better description",
          location: "By the lake",
          imageUrl: "https://github.com",
          tokenCount: 8,
          dateStart: new Date(),
          dateEnd: new Date(),
        },
        false
      );

      const event = await lib.getEvent(eventId, wallet.classicAddress);
      expect(event).toBeDefined();
      assert(event);

      // make payment
      let hash: string;
      const client = new Client(networkConfig.url);
      try {
        await client.connect();
        const response = await client.submitAndWait(
          {
            TransactionType: "Payment",
            Account: wallet.classicAddress,
            Amount: (
              BigInt(event.accounting.depositReserveValue) +
              BigInt(event.accounting.depositFeeValue)
            ).toString(),
            Destination: event.accounting.depositAddress,
            Memos: [
              {
                Memo: {
                  MemoData: Buffer.from(`deposit event ${eventId}`, "utf8")
                    .toString("hex")
                    .toUpperCase(),
                },
              },
            ],
          },
          {
            failHard: true,
            wallet: wallet,
          }
        );
        hash = response.result.hash;
      } finally {
        await client.disconnect();
      }

      const token = await generateToken(
        wallet.classicAddress,
        ["organizer"],
        true
      );
      const response = await request(app)
        .post("/payment/check")
        .set("Authorization", `Bearer ${token}`)
        .send({
          networkId: networkConfig.networkId,
          txHash: hash,
        });

      expect(response.statusCode).toBe(HttpStatusCode.Ok);
      expect(response.body).toEqual({ result: true });
    },
    2 * timeout
  );
});
