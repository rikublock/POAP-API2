import { validate } from "class-validator";
import { plainToClass } from "class-transformer";

import { EnvVariables } from "./check_env";

describe("transform EnvVariables", () => {
  let plain: Record<string, string> = {};

  beforeEach(() => {
    plain = {
      mainnetUrl: "wss://xrplcluster.com",
      mainnetVaultWalletSeed: "",
      testnetUrl: "wss://s.altnet.rippletest.net:51233/",
      testnetVaultWalletSeed: "sEdVZdHg5uJBg6yRm3poMzqgjnsVe6x",
      devnetUrl: "wss://s.devnet.rippletest.net:51233/",
      devnetVaultWalletSeed: "",
      ammDevnetUrl: "wss://amm.devnet.rippletest.net:51233/",
      ammDevnetVaultWalletSeed: "",
      ipfsInfuraId: "70391448321d207cce27051dabe02207",
      ipfsInfuraSecret: "70391448321d207cce27051dabe02207",
      ipfsWeb3StorageApiToken:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      xummApiKey: "7cd8c0ed-a68a-4263-8cc1-b753930ac7cf",
      xummApiSecret: "c53a5b65-7dc7-46dc-a929-96d1710b0950",
      jwtSecret:
        "6daabe0e4bf30932948ab41cc508dca270138c81b94d315735d58b7bdbe2cefc",
      hashidSalt:
        "76d12a794e913f7a44899f50a7661e76385e5cad7ee204771d56abe060657e17",
      maxTickets: "25",
      maxEventSlots: "200",
    };
  });

  test("valid transform", async () => {
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("valid http url", async () => {
    plain.testnetUrl = "https://s.altnet.rippletest.net:51234/";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("bad url", async () => {
    plain.testnetUrl = "bad";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("empty url", async () => {
    plain.testnetUrl = "";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad seed", async () => {
    plain.testnetVaultWalletSeed = "bad";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("undefined seed", async () => {
    delete plain.testnetVaultWalletSeed;
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("empty infura id", async () => {
    plain.ipfsInfuraId = "";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("undefined infura id", async () => {
    delete plain.ipfsInfuraId;
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("bad infura id", async () => {
    plain.ipfsInfuraId = "-";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("short infura id", async () => {
    plain.ipfsInfuraId = "f61c22384cced1c8";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("empty infura secret", async () => {
    plain.ipfsInfuraSecret = "";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("undefined infura secret", async () => {
    delete plain.ipfsInfuraSecret;
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("bad infura secret", async () => {
    plain.ipfsInfuraSecret = "-";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("short infura secret", async () => {
    plain.ipfsInfuraSecret = "f61c22384cced1c8";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("empty web3storage api token", async () => {
    plain.ipfsWeb3StorageApiToken = "";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("undefined web3storage api token", async () => {
    delete plain.ipfsWeb3StorageApiToken;
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("bad web3storage api token", async () => {
    plain.ipfsWeb3StorageApiToken =
      "6daabe0e4bf30932948ab41cc508dca270138c81b94d315735d58b7bdbe2cefc";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad xumm key", async () => {
    plain.xummApiKey =
      "6daabe0e4bf30932948ab41cc508dca270138c81b94d315735d58b7bdbe2cefc";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad xumm secret", async () => {
    plain.xummApiSecret =
      "6daabe0e4bf30932948ab41cc508dca270138c81b94d315735d58b7bdbe2cefc";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("short jwt secret", async () => {
    plain.jwtSecret = "0434c2d491ddfb5a5137e90beb0cc2bb";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad jwt secret", async () => {
    plain.jwtSecret = "-";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("short hashid salt", async () => {
    plain.hashidSalt = "0434c2d491ddfb5a5137e90beb0cc2bb";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("shorter hashid salt", async () => {
    plain.hashidSalt = "f61c22384cced1c8";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad hashid salt", async () => {
    plain.hashidSalt = "-";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad max tickets", async () => {
    plain.maxTickets = "not a number";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("too few max tickets", async () => {
    plain.maxTickets = "0";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("too many max tickets", async () => {
    plain.maxTickets = "300";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad max event slots", async () => {
    plain.maxEventSlots = "not a number";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("negative max event slots", async () => {
    plain.maxEventSlots = "-10";
    const data = plainToClass(EnvVariables, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });
});
