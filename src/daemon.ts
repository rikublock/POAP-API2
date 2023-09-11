import { Attendify } from "./attendify/attendify";

import { NetworkIdentifier } from "./types";
import config from "./config";

// TODO listen for tx
// TODO close canceled events
// TODO refund closed events
// TODO add daemon state to db, scan tx since last
// state: [networkId]: { address, latest ledger, latest hash}

export async function main() {
  const AttendifyLib = new Attendify(
    config.attendify.networkConfigs,
    config.attendify.maxTickets
  );
  await AttendifyLib.init();

  const running = true;
  while (running) {
    const events = await AttendifyLib.getEventsExpired(
      NetworkIdentifier.UNKNOWN // any network
    );

    events.forEach((event) => {
      console.debug(`Closing event ${event.id}`);
      AttendifyLib.closeEvent(event.id);
    });

    // sleep for 10 mins
    await new Promise((r) => setTimeout(r, 10 * 60 * 1000));
  }
}

main();
