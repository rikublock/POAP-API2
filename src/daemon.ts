import { Attendify } from "./attendify/attendify";

import { EventStatus, NetworkIdentifier } from "./types";
import config from "./config";

const TARGET_SLEEP = 10000; // ms

export async function main() {
  const AttendifyLib = new Attendify(
    config.attendify.networkConfigs,
    config.attendify.maxTickets
  );
  await AttendifyLib.init();

  const running = true;
  while (running) {
    const current = Date.now();

    // scan recent transactions
    try {
      await AttendifyLib.scanTransactionHistory(
        NetworkIdentifier.UNKNOWN // any network
      );
    } catch (err) {
      console.error(err);
    }

    // handle paid events
    try {
      const events = await AttendifyLib.getEventsFiltered(
        NetworkIdentifier.UNKNOWN, // any network
        EventStatus.PAID
      );

      for (const event of events) {
        console.debug(`Minting event ${event.id}`);
        await AttendifyLib.mintEvent(event.id);
      }
    } catch (err) {
      console.error(err);
    }

    // handle expired events
    try {
      const events = await AttendifyLib.getEventsExpired(
        NetworkIdentifier.UNKNOWN // any network
      );

      for (const event of events) {
        console.debug(`Canceling event ${event.id}`);
        await AttendifyLib.cancelEvent(event.id);
      }
    } catch (err) {
      console.error(err);
    }

    // handle canceled events
    try {
      const events = await AttendifyLib.getEventsFiltered(
        NetworkIdentifier.UNKNOWN, // any network
        EventStatus.CANCELED
      );

      for (const event of events) {
        console.debug(`Closing event ${event.id}`);
        await AttendifyLib.closeEvent(event.id);
      }
    } catch (err) {
      console.error(err);
    }

    // handle closed events
    try {
      const events = await AttendifyLib.getEventsFiltered(
        NetworkIdentifier.UNKNOWN, // any network
        EventStatus.CLOSED
      );

      for (const event of events) {
        console.debug(`Refunding event ${event.id}`);
        await AttendifyLib.refundDeposit(event.id);
      }
    } catch (err) {
      console.error(err);
    }

    const elapsed = Date.now() - current;
    console.log(`Executed main loop in ${(elapsed / 1000).toFixed(3)}s`);

    const delay = TARGET_SLEEP - elapsed;
    if (delay > 0) {
      console.log(`Resuming main loop in ${(delay / 1000).toFixed(3)}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

main();
