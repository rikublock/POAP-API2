import assert from "node:assert/strict";

import { HttpStatusCode } from "axios";
import type { Express } from "express";
import request from "supertest";

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
  const wallet = {
    address: "rE3wyBpuyQ3BBjEtkhrWyQzyKjJF1vY5oV",
    seed: "sEdVWEJ6Ybe2v8czC3Jfs8FFWXVWDe8",
  };
  const networkConfig: NetworkConfig = {
    networkId: NetworkIdentifier.TESTNET,
    url: "wss://s.altnet.rippletest.net:51233/",
    vaultWalletSeed: "sEd7a9r3UWGLSV6HkKmF3xiCTTi7UHw", // rDnAPDiJk1P4Roh6x7x2eiHsvbbeKtPm3j
  };
  const timeout = 30000;

  const PermissionError = new ServerError(
    HttpStatusCode.Forbidden,
    "Permission denied"
  );

  beforeAll(async () => {
    assert(config.isTesting); // safety to ensure we don't wipe an existing db

    lib = new Attendify([networkConfig]);
    await lib.init();
    app = await setup(lib);
  });

  afterAll(async () => {
    await db.close();
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
      const token = await generateToken(wallet.address, [], true);
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
      await lib.getUser(wallet.address, true, true, true);

      const token = await generateToken(wallet.address, ["organizer"], true);
      const response = await request(app)
        .post("/event/create")
        .set("Authorization", `Bearer ${token}`)
        .send({
          networkId: networkConfig.networkId,
          title: "A title",
          description: "An even better description",
          location: "By the lake",
          imageUrl: "https://github.com",
          tokenCount: 5,
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
      await lib.getUser(wallet.address, true, true, true);

      const token = await generateToken(wallet.address, ["organizer"]);
      const response = await request(app)
        .get("/user/info")
        .set("Authorization", `Bearer ${token}`);

      expect(response.statusCode).toBe(HttpStatusCode.Ok);
      expect(response.body).toEqual({
        result: {
          walletAddress: wallet.address,
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
});
