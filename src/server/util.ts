import Hashids from "hashids";

import config from "../config";

export const hashids = new Hashids(
  config.server.hashidSalt,
  config.server.hashidLength
);
