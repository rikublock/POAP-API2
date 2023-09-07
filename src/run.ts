import { Attendify } from "./attendify";
import config from "./config";
import { setup } from "./server/app";

export async function main() {
  const lib = new Attendify(config.attendify.networkConfigs);
  await lib.init();

  const app = await setup(lib);

  app.listen(config.server.port, () => {
    console.log(
      `XRPL Attendify server listening on port http://localhost:${config.server.port}`
    );
  });
}

main();
