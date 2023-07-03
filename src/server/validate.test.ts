import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import {
  APIPostEventCreate,
  APIPostUserUpdate,
  IsXrpAddress,
  IsNotTrimmable,
  APIGetEventInfo,
  APIGetEventsPublic,
  APIGetEventsOwned,
  APIPostEventInvite,
} from "./validate";
import { NetworkIdentifier } from "../types";

describe("validate XRP address", () => {
  class Post {
    @IsXrpAddress()
    address: string;
  }

  const post = new Post();

  test("valid address", async () => {
    post.address = "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah";
    const errors = await validate(post);
    expect(errors.length).toBe(0);
  });

  test("invalid address (X-address)", async () => {
    post.address = "XV5sbjUmgPpvXv4ixFWZ5ptAYZ6PD28Sq49uo34VyjnmK5H";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("invalid address (ETH address)", async () => {
    post.address = "0xC1b634853Cb333D3aD8663715b08f41A3Aec47cc";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("empty address", async () => {
    post.address = "";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("null value address", async () => {
    // @ts-ignore
    post.address = null;
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("undefined value address", async () => {
    // @ts-ignore
    post.address = undefined;
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });
});

describe("validate not-trimmable string", () => {
  class Post {
    @IsNotTrimmable()
    value: string;
  }

  const post = new Post();

  test("valid value", async () => {
    post.value = "test";
    const errors = await validate(post);
    expect(errors.length).toBe(0);
  });

  test("single space", async () => {
    post.value = " ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("multiple spaces", async () => {
    post.value = "   ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("single tab", async () => {
    post.value = "\t";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("mix space tab", async () => {
    post.value = " \t";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("tailing space", async () => {
    post.value = "test ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("tailing spaces", async () => {
    post.value = "test  ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("leading space", async () => {
    post.value = " test";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("leading and tailing space", async () => {
    post.value = " test ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("tailing tab", async () => {
    post.value = "test\t";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("leading tab", async () => {
    post.value = "\ttest";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("mix value space tab", async () => {
    post.value = " test\t";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("tailing newline", async () => {
    post.value = "test\n";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("leading newline", async () => {
    post.value = "\ntest";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });
});

describe("transform APIPostEventInvite", () => {
  test("valid transform", async () => {
    const plain = {
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      eventId: 2,
      attendeeWalletAddresses: [
        "rrsVFfD7FBbxV5o9wsEX5KeyCzxVW1gQRh",
        "rBmEVWatnrg5BnkN7XFrtLYSdiZEmXcv5g",
        "rB6gbpw78Uaie48Hjyv6ZDXrYSDUq4Mfys",
        "rpVAi73dhytYeWQLMEiWmEgbGrCfpuE4BC",
        "rUdzKueuwVe8RQ9yS5ENffXByE3Q2Fjb18",
      ],
    };
    const data = plainToClass(APIPostEventInvite, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("empty array", async () => {
    const plain = {
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      eventId: 2,
      attendeeWalletAddresses: [],
    };
    const data = plainToClass(APIPostEventInvite, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("bad array item", async () => {
    const plain = {
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      eventId: 2,
      attendeeWalletAddresses: [
        "rrsVFfD7FBbxV5o9wsEX5KeyCzxVW1gQRh",
        "bad",
        "rB6gbpw78Uaie48Hjyv6ZDXrYSDUq4Mfys",
        "rpVAi73dhytYeWQLMEiWmEgbGrCfpuE4BC",
        "rUdzKueuwVe8RQ9yS5ENffXByE3Q2Fjb18",
      ],
    };
    const data = plainToClass(APIPostEventInvite, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("duplicate array item", async () => {
    const plain = {
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      eventId: 2,
      attendeeWalletAddresses: [
        "rrsVFfD7FBbxV5o9wsEX5KeyCzxVW1gQRh",
        "rrsVFfD7FBbxV5o9wsEX5KeyCzxVW1gQRh",
        "rB6gbpw78Uaie48Hjyv6ZDXrYSDUq4Mfys",
        "rpVAi73dhytYeWQLMEiWmEgbGrCfpuE4BC",
        "rUdzKueuwVe8RQ9yS5ENffXByE3Q2Fjb18",
      ],
    };
    const data = plainToClass(APIPostEventInvite, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("too many array items", async () => {
    const plain = {
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      eventId: 2,
      attendeeWalletAddresses: [
        "rkUWBZEv8dUTYrAvwPnFnZ1vQPnwFhvWx",
        "ravP2yspTtqW4ARomdENM6h2jnHViP169",
        "rLNfX3jJaRXRonPj7M4JoYvzakiK6AgyTM",
        "rpbbEn1gEnHhtHEMxA2TYiW67cBRoAVSpo",
        "rnezYCqHCjLnUrsvThp2hvjPx5j6zNgQCP",
        "rafTjCHHT3rg6MunpEqmYBtsVkZ7VWojbc",
        "raWHbNYgQrZ7pWtPHLj7jd3Fv3V76aUrLU",
        "rnknSVN2dNMCfeYEAvTMQzD1oBEu7S5y5F",
        "rNXERc4t8dPuYs7VbUnVTNntdtbeuufd8H",
        "rnJHbVqbLDDpmupjMXTGKSHi7JbDGoqKCK",
        "rJCbeMxyJwa1Euqo6uWSEeYY6iGRX5DrAu",
        "rh5o9vTrnbQvGuAWLzmTjRj8u242YVabhD",
        "rGoCoyMgriDz25fzhHEtwr9cHMLP8L3pGc",
        "rKS2UsQy1M3QaaPXJ4ZxXE8CtuDU4CvhHs",
        "raAnBumeANcknkUipiLdwoFwwHQQeEMiR5",
        "rNX2AuFh8TDJEz8ccYryW4oPUpFepeFRnZ",
        "rwp8qsCF4RM29GRjX7fMVTE4rucmbRaNE2",
        "rpwsRLVJsxu3CkvADBH1gwZud8wHkN3VST",
        "rKnYoxsb3CzABQyfPPBn1vuWFufLgfPyC9",
        "rGtW9AYjFVMdHg7Uq1jzTjBpmw6HFDR2sB",
        "rBauHuAZmgkKuRibPH6wovz6Fve6KY8jWp",
        "r9oRuVznnVYba6vdbGzQ8kWvfHkVFj7kqt",
        "rw3zqug7d5X3aDcnsP5eDg6L8wjDteELr2",
        "rNxHTdhKqVAhkRKat9jFT4BzJxkzQ1sqvZ",
        "rst1J6uJpMUgPpNb25PG8t7uSRxN2Rfx7x",
        "raGV7bUEdhtpyeG3ow4XsJvasE9sFGLsMH",
        "rEhiYUShxyt6NxHWgQGsSSfXfNLpRBPLjW",
        "rhutiFo11UnbU1oHKRhU6e1grbYTEv8NQP",
        "rBDNEKTr4fzB7ePCxahaeM4AcBQGUDqwVs",
        "rAr5PfuwTBmCRMMrYaGedjZgmuXDjY33D",
        "r4XnhvAgukhgcxSZSLdzpZzQtPLSWcATwM",
        "rEUh8HyTu6hnEmvrQumhWpANVjEnyDYiFy",
        "rGmMpfpjqqy8xmxdtxt5x5wiEc3b16HjND",
        "rGZ5Q2mSQUw125pfsU7JfmKmUxDggWcP59",
        "rfarXJE5KroGYGBHn2hbk5n2cV7K4bsLgb",
        "rHNCbzU8WzE4ZSWArHya7vTSnNHo1sGL55",
        "rhBnAjiFy9Mvo2N57kReMNvMe47UCoLHLK",
        "rBjn8hZQDStotXiQnkQc2EvmpdsJ2m1tfB",
        "rGbqeVXWMxYzuygDPedn1E2GQPqBy1m9sY",
        "rJFWAiareV4rqnfEZT7rVtEfd2LqhGJPgc",
        "rLPpcTC7WPe7VVGX7GNYMt2vFXNShp7ixG",
        "rEbiCty43RLxQ7pZvMzSq6rVSjE67REVb6",
        "rP6PTUKSjnRfw15Mj1WyCqC3B6cVUMRkAZ",
        "rpUEm8TLn2p4Pac8FPCM8apf9iiKifQsZq",
        "rhed8bTLFirXWmdyhFkgm24oGN9eDsvoPy",
        "rnrGFTWE55Ypbyxmyez1S7gB7xqebcxoFH",
        "rf6t3zmyUD6E2sXbr5SQescNauMbVVxtkx",
        "rnppnhg4wxMFvNcYStstzBYP3WeWbbJC86",
        "rLFmPMTGBxDe5AZ5gcr8y1js2mur8Fnhny",
        "rNmLztiCHibwdj2u3z8N1FPtaDmih467WX",
        "rNgeocbtoJZL42VCwbVs1zSjZmdvNzxHTh",
      ],
    };
    const data = plainToClass(APIPostEventInvite, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });
});

describe("transform APIGetEventInfo", () => {
  test("valid transform", async () => {
    const plain = {
      id: 5,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
    };
    const data = plainToClass(APIGetEventInfo, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("additional field", async () => {
    const plain = {
      id: 5,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      MORE: "str",
    };
    const data = plainToClass(APIGetEventInfo, plain, {
      excludeExtraneousValues: true,
    });
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data).not.toHaveProperty("MORE");
  });

  test("type conversion number", async () => {
    const plain = {
      id: "5",
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
    };
    const data = plainToClass(APIGetEventInfo, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.id).toBe(5);
  });

  test("optional wallet address", async () => {
    const plain = {
      id: 5,
    };
    const data = plainToClass(APIGetEventInfo, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("invalid wallet address", async () => {
    const plain = {
      id: 5,
      walletAddress: "bad",
    };
    const data = plainToClass(APIGetEventInfo, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });
});

describe("transform APIGetEventsOwned", () => {
  test("valid transform", async () => {
    const plain = {
      networkId: NetworkIdentifier.TESTNET,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: 50,
      includeAttendees: true,
    };
    const data = plainToClass(APIGetEventsOwned, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("additional field", async () => {
    const plain = {
      networkId: NetworkIdentifier.TESTNET,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: 50,
      includeAttendees: true,
      MORE: "str",
    };
    const data = plainToClass(APIGetEventsOwned, plain, {
      excludeExtraneousValues: true,
    });
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data).not.toHaveProperty("MORE");
  });

  test("unknown network ID", async () => {
    const plain = {
      networkId: NetworkIdentifier.UNKNOWN,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: 50,
      includeAttendees: true,
    };
    const data = plainToClass(APIGetEventsOwned, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("integer network ID", async () => {
    const plain = {
      networkId: 2,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: 50,
      includeAttendees: true,
    };
    const data = plainToClass(APIGetEventsOwned, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.networkId).toBe(NetworkIdentifier.TESTNET);
  });

  test("string network ID", async () => {
    const plain = {
      networkId: "2",
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: 50,
      includeAttendees: true,
    };
    const data = plainToClass(APIGetEventsOwned, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.networkId).toBe(NetworkIdentifier.TESTNET);
  });

  test("invalid wallet address", async () => {
    const plain = {
      networkId: NetworkIdentifier.TESTNET,
      walletAddress: "bad",
      limit: 50,
      includeAttendees: true,
    };
    const data = plainToClass(APIGetEventsOwned, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("string limit", async () => {
    const plain = {
      networkId: NetworkIdentifier.TESTNET,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: "50",
      includeAttendees: true,
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.limit).toBe(50);
  });

  test("optional limit", async () => {
    const plain = {
      networkId: NetworkIdentifier.TESTNET,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      includeAttendees: true,
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.limit).toBe(undefined);
  });

  test("string include attendees true", async () => {
    const plain = {
      networkId: NetworkIdentifier.TESTNET,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: 50,
      includeAttendees: "true",
    };
    const data = plainToClass(APIGetEventsOwned, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.includeAttendees).toBe(true);
  });

  test("string include attendees false", async () => {
    const plain = {
      networkId: NetworkIdentifier.TESTNET,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: 50,
      includeAttendees: "false",
    };
    const data = plainToClass(APIGetEventsOwned, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.includeAttendees).toBe(false);
  });

  test("string number include attendees", async () => {
    const plain = {
      networkId: NetworkIdentifier.TESTNET,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      limit: 50,
      includeAttendees: "1",
    };
    const data = plainToClass(APIGetEventsOwned, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.includeAttendees).toBe(true);
  });
});

describe("transform APIPostEventCreate", () => {
  test("valid transform", async () => {
    const plain = {
      networkId: 3,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      title: "A title",
      description: "An even better description",
      location: "By the lake",
      imageUrl: "https://github.com",
      tokenCount: 2,
      dateStart: "2023-06-18T22:00:00.000Z",
      dateEnd: "2023-06-28T22:00:00.000Z",
      isManaged: true,
    };
    const post = plainToClass(APIPostEventCreate, plain);
    const errors = await validate(post);
    expect(errors.length).toBe(0);
  });

  test("additional field", async () => {
    const plain = {
      networkId: 3,
      walletAddress: "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah",
      title: "A title",
      description: "An even better description",
      location: "By the lake",
      imageUrl: "https://github.com",
      tokenCount: 2,
      dateStart: "2023-06-18T22:00:00.000Z",
      dateEnd: "2023-06-28T22:00:00.000Z",
      isManaged: true,
      MORE: "str",
    };
    const post = plainToClass(APIPostEventCreate, plain, {
      excludeExtraneousValues: true,
    });
    const errors = await validate(post);
    expect(errors.length).toBe(0);
    expect(post).not.toHaveProperty("MORE");
  });
});

describe("validate APIPostEventCreate", () => {
  // valid
  const getPost = () => {
    const post = new APIPostEventCreate();
    post.networkId = NetworkIdentifier.DEVNET;
    post.walletAddress = "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah";
    post.title = "A title";
    post.description = "An even better description";
    post.location = "By the lake";
    post.imageUrl = "https://github.com";
    post.tokenCount = 2;
    post.dateStart = new Date();
    post.dateEnd = new Date();
    post.isManaged = true;
    return post;
  };

  test("valid request data", async () => {
    const post = getPost();
    const errors = await validate(post);
    expect(errors.length).toBe(0);
  });

  test("unknown network ID", async () => {
    const post = getPost();
    post.networkId = NetworkIdentifier.UNKNOWN;
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("zero token count", async () => {
    const post = getPost();
    post.tokenCount = 0;
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("negative token count", async () => {
    const post = getPost();
    post.tokenCount = -3;
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("float token count", async () => {
    const post = getPost();
    post.tokenCount = 2.1;
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("exceeding token count", async () => {
    const post = getPost();
    post.tokenCount = 1000;
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("invalid image url", async () => {
    const post = getPost();
    post.imageUrl = "my dog";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("empty image url", async () => {
    const post = getPost();
    post.imageUrl = "";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("uncommon image uri", async () => {
    const post = getPost();
    post.imageUrl = "ipfs://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("local image url", async () => {
    const post = getPost();
    post.imageUrl = "http://localhost:3000/";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("whitespace image url", async () => {
    const post = getPost();
    post.imageUrl = "https://github.com ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("empty title", async () => {
    const post = getPost();
    post.title = "";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("only whitespace title", async () => {
    const post = getPost();
    post.title = " ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("tailing whitespace title", async () => {
    const post = getPost();
    post.title = "A title ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("whitespace title", async () => {
    const post = getPost();
    post.title = " A title ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  // Note: desc, loc don't have any special requirements

  test("date string simple", async () => {
    const post = getPost();
    // @ts-ignore
    post.dateStart = "7/7/2023";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("date string simple", async () => {
    const post = getPost();
    // @ts-ignore
    post.dateStart = "2023-06-12T22:00:00.000Z";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });
});

describe("validate APIPostUserUpdate", () => {
  // valid
  const getPost = () => {
    const post = new APIPostUserUpdate();
    post.walletAddress = "rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah";
    post.firstName = "Riku";
    post.lastName = "Block";
    post.email = "riku.block@good.com";
    return post;
  };

  test("optional first name", async () => {
    const post = getPost();
    post.firstName = null;
    const errors = await validate(post);
    expect(errors.length).toBe(0);
  });

  test("empty first name", async () => {
    const post = getPost();
    post.firstName = "";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("only whitespace first name", async () => {
    const post = getPost();
    post.firstName = " ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("trimmable first name", async () => {
    const post = getPost();
    post.firstName = "Riku ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("empty last name", async () => {
    const post = getPost();
    post.lastName = "";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("only whitespace last name", async () => {
    const post = getPost();
    post.lastName = " ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("trimmable last name", async () => {
    const post = getPost();
    post.lastName = "Block ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("empty email", async () => {
    const post = getPost();
    post.email = "";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("only whitespace email", async () => {
    const post = getPost();
    post.email = " ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("invalid email", async () => {
    const post = getPost();
    post.email = "riku@bad.c";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });

  test("trimmable email", async () => {
    const post = getPost();
    post.email = "riku@good.com ";
    const errors = await validate(post);
    expect(errors.length).toBe(1);
  });
});

describe("transform APIGetEventsPublic", () => {
  test("valid transform", async () => {
    const plain = {
      networkId: NetworkIdentifier.MAINNET,
      limit: 50,
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("unknown network ID", async () => {
    const plain = {
      networkId: NetworkIdentifier.UNKNOWN,
      limit: 50,
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("integer network ID", async () => {
    const plain = {
      networkId: 3,
      limit: 50,
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.networkId).toBe(NetworkIdentifier.DEVNET);
  });

  test("string network ID", async () => {
    const plain = {
      networkId: "3",
      limit: 50,
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.networkId).toBe(NetworkIdentifier.DEVNET);
  });

  test("string limit", async () => {
    const plain = {
      networkId: 3,
      limit: "50",
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
  });

  test("large limit", async () => {
    const plain = {
      networkId: 3,
      limit: 2000,
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(1);
  });

  test("optional limit", async () => {
    const plain = {
      networkId: 3,
    };
    const data = plainToClass(APIGetEventsPublic, plain);
    const errors = await validate(data);
    expect(errors.length).toBe(0);
    expect(data.limit).toBe(undefined);
  });
});
