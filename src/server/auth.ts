import axios from "axios";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { verify, deriveAddress } from "ripple-keypairs";
import { convertStringToHex } from "xrpl";
import type { SdkTypes } from "xumm-sdk";
import { randomUUID } from "crypto";

import config from "../config";

export const ISSUER = "https://oauth2.xumm.app";

type ConfigData = {
  jwks_uri: string;
};

async function fetchKey(iss: string) {
  const response = await axios.get(
    new URL("/.well-known/openid-configuration", iss).toString(),
    {
      responseType: "json",
      timeout: 5000,
      validateStatus: (status) => {
        return status === 200;
      },
    }
  );

  const client = jwksClient({
    jwksUri: (response.data as ConfigData)?.jwks_uri,
  });

  const key = await client.getSigningKey();
  return key.getPublicKey();
}

export async function verifyXummToken(
  token: string,
  walletAddress: string
): Promise<boolean> {
  try {
    const data = jwt.decode(token);

    // verify basic
    if ((data as SdkTypes.JwtPong)?.iss !== ISSUER) {
      return false;
    }
    if ((data as SdkTypes.JwtPong)?.client_id !== config.server.xummApiKey) {
      return false;
    }
    if ((data as SdkTypes.JwtPong)?.sub !== walletAddress) {
      return false;
    }

    // verify signature
    const key = await fetchKey(ISSUER);
    await jwt.verify(token, key);

    return true;
  } catch (err) {
    console.debug(err);
    return false;
  }
}

export async function verifyGemToken(
  token: string,
  signature: string,
  walletAddress: string
): Promise<boolean> {
  try {
    // const { public_key, address }
    const payload = (await jwt.verify(
      token,
      config.server.jwtSecret
    )) as TempJwtPayload;
    console.log(payload);

    if (!payload.pubkey) {
      return false;
    }
    if (walletAddress !== deriveAddress(payload.pubkey)) {
      return false;
    }

    const messageHex = convertStringToHex(`backend authentication: ${token}`);
    return verify(messageHex, signature, payload.pubkey);
  } catch (err) {
    console.debug(err);
    return false;
  }
}

export type TempJwtPayload = jwt.JwtPayload & {
  nonce: string;
  pubkey: string;
};

export async function generateTempToken(pubkey: string): Promise<string> {
  const uuid = randomUUID();
  const token = jwt.sign(
    {
      nonce: uuid,
      pubkey: pubkey,
    },
    config.server.jwtSecret,
    {
      expiresIn: "12h",
      algorithm: "HS256",
    }
  );

  return token;
}

export type JwtPayload = jwt.JwtPayload & {
  walletAddress: string;
  permissions: string[];
  refreshable: boolean;
};

export async function generateToken(
  walletAddress: string,
  refreshable: boolean = false,
  expiresIn: string = "12h"
): Promise<string> {
  const token = jwt.sign(
    {
      walletAddress: walletAddress,
      permissions: [],
      refreshable: refreshable,
    },
    config.server.jwtSecret,
    {
      expiresIn: expiresIn,
      algorithm: "HS256",
    }
  );

  return token;
}
