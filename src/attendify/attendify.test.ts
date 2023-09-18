import assert from "node:assert/strict";

import { AccountSetAsfFlags, Client, Wallet } from "xrpl";

import config from "../config";
import { NetworkIdentifier, type NetworkConfig, EventStatus } from "../types";
import { Attendify, FALLBACK_TX_FEE } from "./attendify";
import { AttendifyError } from "./error";
import { db, orm } from "./models";

describe("attendify API", () => {
  let lib: Attendify;
  const wallet = Wallet.fromSeed("sEdSu8JNpAnoYk4EY4KE9c5JX3FRv68"); // rMvLt6A88ndyUie5pzipYkgHyzhNDppw8R
  const walletAuthorized = Wallet.fromSeed("sEdVWEJ6Ybe2v8czC3Jfs8FFWXVWDe8"); // rE3wyBpuyQ3BBjEtkhrWyQzyKjJF1vY5oV
  const networkConfig: NetworkConfig = {
    networkId: NetworkIdentifier.TESTNET,
    url: "wss://s.altnet.rippletest.net:51233/",
    vaultWalletSeed: "sEd7a9r3UWGLSV6HkKmF3xiCTTi7UHw", // rDnAPDiJk1P4Roh6x7x2eiHsvbbeKtPm3j
  };
  const timeout = 60000;

  beforeAll(async () => {
    assert(config.isTesting); // safety to ensure we don't wipe an existing db

    lib = new Attendify([networkConfig], 5);
    await lib.init();
  });

  beforeEach(async () => {
    // wipe db
    await db.sync({ force: true });
  });

  test.each([
    [0, 0n],
    [1, 4000000n],
    [20, 44000000n],
    [50, 108000000n],
    [200, 426000000n],
    [1000, 2126000000n],
  ])(
    "calculate deposit values",
    async (slots, expected) => {
      const [depositReserveValue, depositFeeValue] =
        await lib.calcDepositValues(networkConfig.networkId, slots);
      expect(depositReserveValue).toBe(expected);
      expect(depositFeeValue).toBe(1000000n);
    },
    timeout
  );

  test(
    "mint and close event",
    async () => {
      // create user db entry
      await lib.getUser(walletAuthorized.classicAddress, true, true, true);

      // create event db entry
      const tokenCount = 18;
      const eventId = await lib.createEvent(
        networkConfig.networkId,
        walletAuthorized.classicAddress,
        {
          title: "A title",
          description: "An even better description",
          location: "By the lake",
          imageUrl: "https://github.com",
          tokenCount: tokenCount,
          dateStart: new Date(),
          dateEnd: new Date(),
        },
        false
      );

      await expect(async () => {
        await lib.mintEvent(eventId);
      }).rejects.toThrow(AttendifyError);

      // mark as paid
      await db.transaction(async (t) => {
        const event = await orm.Event.findByPk(eventId, {
          include: [orm.Event.associations.accounting],
          lock: true,
          transaction: t,
        });

        await event?.update(
          {
            status: EventStatus.PAID,
          },
          { transaction: t }
        );
      });

      // let event = await lib.getEvent(eventId, walletAuthorized.classicAddress);

      // // authorize minter
      // const client = new Client(networkConfig.url);
      // try {
      //   await client.connect();
      //   await client.submitAndWait(
      //     {
      //       TransactionType: "AccountSet",
      //       Account: walletAuthorized.classicAddress,
      //       NFTokenMinter: event.accounting.depositAddress,
      //       SetFlag: AccountSetAsfFlags.asfAuthorizedNFTokenMinter,
      //     },
      //     {
      //       failHard: true,
      //       wallet: walletAuthorized,
      //     }
      //   );
      // } finally {
      //   await client.disconnect();
      // }

      // mint event
      await lib.mintEvent(eventId);

      let event = await lib.getEvent(eventId, walletAuthorized.classicAddress);
      expect(event).toBeDefined();
      assert(event);
      expect(event.status).toBe(EventStatus.ACTIVE);
      expect(event.uri).toBeDefined();
      expect(event.accounting).toBeDefined();
      expect(BigInt(event.accounting.accumulatedTxFees)).toBeGreaterThanOrEqual(
        // 1x create ticket
        BigInt((tokenCount + 1) * 10)
      );
      expect(event.nfts?.length).toBe(tokenCount);

      // close event
      await lib.cancelEvent(eventId);
      await lib.closeEvent(eventId);

      event = await lib.getEvent(eventId, walletAuthorized.classicAddress);
      expect(event).toBeDefined();
      assert(event);
      expect(event.status).toBe(EventStatus.CLOSED);
      expect(BigInt(event.accounting.accumulatedTxFees)).toBeGreaterThanOrEqual(
        // 4x create ticket
        BigInt((2 * tokenCount + 1 + 3) * 10)
      );
    },
    3 * timeout
  );

  test(
    "mint unauthorized",
    async () => {
      // create user db entry
      await lib.getUser(wallet.classicAddress, true, true, true);

      // create event db entry
      const tokenCount = 8;
      const eventId = await lib.createEvent(
        networkConfig.networkId,
        wallet.classicAddress,
        {
          title: "A title",
          description: "An even better description",
          location: "By the lake",
          imageUrl: "https://github.com",
          tokenCount: tokenCount,
          dateStart: new Date(),
          dateEnd: new Date(),
        },
        false
      );

      // mark as paid
      await db.transaction(async (t) => {
        const event = await orm.Event.findByPk(eventId, {
          include: [orm.Event.associations.accounting],
          lock: true,
          transaction: t,
        });

        await event?.update(
          {
            status: EventStatus.PAID,
          },
          { transaction: t }
        );
      });

      // attempt to mint event
      await expect(async () => {
        await lib.mintEvent(eventId);
      }).rejects.toThrow(AttendifyError);

      // find tickets
      const [ticketSequences, txFees] = await lib.prepareTickets(
        networkConfig.networkId,
        tokenCount
      );

      // remove tickets by using AccountSet with no options
      // see: https://xrpl.org/canceling-a-transaction.html
      const [client, walletVault] = lib.getNetworkConfig(
        networkConfig.networkId
      );
      await client.connect();
      try {
        const promises = [];
        for (let j = 0; j < tokenCount; ++j) {
          promises.push(
            client.submitAndWait(
              {
                TransactionType: "AccountSet",
                Account: walletVault.classicAddress,
                Sequence: 0,
                TicketSequence: ticketSequences[j],
              },
              {
                failHard: true,
                wallet: walletVault,
              }
            )
          );
        }
        await Promise.all(promises);
      } finally {
        await client.disconnect();
      }

      const event = await lib.getEvent(eventId, wallet.classicAddress);
      expect(event?.status).toBe(EventStatus.CANCELED);
    },
    3 * timeout
  );

  test(
    "refund event deposit",
    async () => {
      // create user db entry
      await lib.getUser(walletAuthorized.classicAddress, true, true, true);

      // create event db entry
      const tokenCount = 8;
      const eventId = await lib.createEvent(
        networkConfig.networkId,
        walletAuthorized.classicAddress,
        {
          title: "A title",
          description: "An even better description",
          location: "By the lake",
          imageUrl: "https://github.com",
          tokenCount: tokenCount,
          dateStart: new Date(),
          dateEnd: new Date(),
        },
        false
      );

      const [depositReserveValue, depositFeeValue] =
        await lib.calcDepositValues(networkConfig.networkId, tokenCount);
      const value = (
        depositReserveValue +
        depositFeeValue -
        FALLBACK_TX_FEE
      ).toString();

      let event = await lib.getEvent(eventId, walletAuthorized.classicAddress);
      expect(event).toBeDefined();
      assert(event);

      // make payment
      let txHash: string;
      const client = new Client(networkConfig.url);
      await client.connect();
      try {
        const response = await client.submitAndWait(
          {
            TransactionType: "Payment",
            Account: walletAuthorized.classicAddress,
            Amount: (depositReserveValue + depositFeeValue).toString(),
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
            wallet: walletAuthorized,
          }
        );
        txHash = response.result.hash;
      } finally {
        await client.disconnect();
      }

      // verify payment
      const success = await lib.checkPayment(networkConfig.networkId, txHash);
      expect(success).toBe(true);

      // mark as closed
      await db.transaction(async (t) => {
        const event = await orm.Event.findByPk(eventId, {
          include: [orm.Event.associations.accounting],
          lock: true,
          transaction: t,
        });

        await event?.update(
          {
            status: EventStatus.CLOSED,
          },
          { transaction: t }
        );
      });

      // refund deposit
      const hash = await lib.refundDeposit(eventId);

      event = await lib.getEvent(eventId, walletAuthorized.classicAddress);
      expect(event).toBeDefined();
      assert(event);
      expect(event.status).toBe(EventStatus.REFUNDED);
      expect(event.accounting).toBeDefined();
      expect(event.accounting?.refundValue).toBe(value);
      expect(event.accounting?.refundTxHash).toBe(hash);
    },
    timeout
  );
});
