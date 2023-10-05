import { validate } from "class-validator";
import { plainToClass } from "class-transformer";

import { EnvVariables } from "./check_env";

describe("transform EnvVariables", () => {
  let plain: Record<string, string> = {};

  beforeEach(() => {
    plain = {
      MAINNET_URL: "wss://xrplcluster.com",
      MAINNET_VAULT_WALLET_SEED: "",
      TESTNET_URL: "wss://s.altnet.rippletest.net:51233/",
      TESTNET_VAULT_WALLET_SEED: "sEdVZdHg5uJBg6yRm3poMzqgjnsVe6x",
      DEVNET_URL: "wss://s.devnet.rippletest.net:51233/",
      DEVNET_VAULT_WALLET_SEED: "",
      AMM_DEVNET_URL: "wss://amm.devnet.rippletest.net:51233/",
      AMM_DEVNET_VAULT_WALLET_SEED: "",
      IPFS_INFURA_ID: "70391448321d207cce27051dabe02207",
      IPFS_INFURA_SECRET: "70391448321d207cce27051dabe02207",
      IPFS_WEB3_STORAGE_API_TOKEN:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      XUMM_API_KEY: "7cd8c0ed-a68a-4263-8cc1-b753930ac7cf",
      XUMM_API_SECRET: "c53a5b65-7dc7-46dc-a929-96d1710b0950",
      JWT_SECRET:
        "6daabe0e4bf30932948ab41cc508dca270138c81b94d315735d58b7bdbe2cefc",
      HASHID_SALT:
        "76d12a794e913f7a44899f50a7661e76385e5cad7ee204771d56abe060657e17",
      MAX_TICKETS: "25",
      MAX_EVENT_SLOTS: "200",
    };
  });

  test("valid transform", async () => {
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("valid http url", async () => {
    plain.TESTNET_URL = "https://s.altnet.rippletest.net:51234/";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("bad url", async () => {
    plain.TESTNET_URL = "bad";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("empty url", async () => {
    plain.TESTNET_URL = "";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad seed", async () => {
    plain.TESTNET_VAULT_WALLET_SEED = "bad";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("undefined seed", async () => {
    delete plain.TESTNET_VAULT_WALLET_SEED;
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("empty infura id", async () => {
    plain.IPFS_INFURA_ID = "";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("undefined infura id", async () => {
    delete plain.IPFS_INFURA_ID;
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("bad infura id", async () => {
    plain.IPFS_INFURA_ID = "-";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("short infura id", async () => {
    plain.IPFS_INFURA_ID = "f61c22384cced1c8";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("empty infura secret", async () => {
    plain.IPFS_INFURA_SECRET = "";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("undefined infura secret", async () => {
    delete plain.IPFS_INFURA_SECRET;
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("bad infura secret", async () => {
    plain.IPFS_INFURA_SECRET = "-";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("short infura secret", async () => {
    plain.IPFS_INFURA_SECRET = "f61c22384cced1c8";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("empty web3storage api token", async () => {
    plain.IPFS_WEB3_STORAGE_API_TOKEN = "";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("undefined web3storage api token", async () => {
    delete plain.IPFS_WEB3_STORAGE_API_TOKEN;
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("bad web3storage api token", async () => {
    plain.IPFS_WEB3_STORAGE_API_TOKEN =
      "6daabe0e4bf30932948ab41cc508dca270138c81b94d315735d58b7bdbe2cefc";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad xumm key", async () => {
    plain.XUMM_API_KEY =
      "6daabe0e4bf30932948ab41cc508dca270138c81b94d315735d58b7bdbe2cefc";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad xumm secret", async () => {
    plain.XUMM_API_SECRET =
      "6daabe0e4bf30932948ab41cc508dca270138c81b94d315735d58b7bdbe2cefc";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("short jwt secret", async () => {
    plain.JWT_SECRET = "0434c2d491ddfb5a5137e90beb0cc2bb";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad jwt secret", async () => {
    plain.JWT_SECRET = "-";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("short hashid salt", async () => {
    plain.HASHID_SALT = "0434c2d491ddfb5a5137e90beb0cc2bb";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("shorter hashid salt", async () => {
    plain.HASHID_SALT = "f61c22384cced1c8";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad hashid salt", async () => {
    plain.HASHID_SALT = "-";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad max tickets", async () => {
    plain.MAX_TICKETS = "not a number";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("too few max tickets", async () => {
    plain.MAX_TICKETS = "0";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("too many max tickets", async () => {
    plain.MAX_TICKETS = "300";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad max event slots", async () => {
    plain.MAX_EVENT_SLOTS = "not a number";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("negative max event slots", async () => {
    plain.MAX_EVENT_SLOTS = "-10";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });
});
