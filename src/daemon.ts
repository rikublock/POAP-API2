import { Attendify } from "./attendify/attendify";

import { NetworkIdentifier } from "./types";
import config from "./config";

export async function main() {
  const AttendifyLib = new Attendify(config.attendify.networkConfigs);
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
