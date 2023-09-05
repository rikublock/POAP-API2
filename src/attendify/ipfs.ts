import { create } from "ipfs-http-client";
import { Web3Storage, File } from "web3.storage";

import config from "../config";

/**
 * Upload provided json data to IPFS using the Infura API endpoint
 * @param data - json metadata
 * @returns IPFS resource url in the form https://ipfs.io/ipfs/CID
 */
export async function postToIPFSInfura(data: string): Promise<string> {
  let ipfs;
  let path = "";
  try {
    const INFURA_DATA =
      config.attendify.ipfs.infuraId + ":" + config.attendify.ipfs.infuraSecret;
    const authorization =
      "Basic " + Buffer.from(INFURA_DATA, "utf8").toString("base64");
    ipfs = create({
      url: "https://infura-ipfs.io:5001/api/v0",
      headers: {
        authorization,
      },
    });
    const result = await ipfs.add(data);
    path = `https://ipfs.io/ipfs/${result.path}`;
  } catch (error) {
    console.error("IPFS error: ", error);
  }
  return path;
}

/**
 * Upload provided json data to IPFS using the Web3.Storage API endpoint
 * @param data - json metadata
 * @returns IPFS resource url in the form https://ipfs.io/ipfs/CID
 */
export async function postToIPFSWeb3Storage(data: string): Promise<string> {
  let path = "";
  try {
    const client = new Web3Storage({
      token: config.attendify.ipfs.web3StorageToken,
    });

    const fileName = "metadata.json";
    const file = new File([data], fileName, { type: "application/json" });
    const cid = await client.put([file]);
    path = `https://ipfs.io/ipfs/${cid}/${fileName}`;
  } catch (error) {
    console.error("IPFS error: ", error);
  }
  return path;
}

/**
 * Upload provided json data to IPFS
 * @param data - json metadata
 * @returns IPFS resource url in the form https://ipfs.io/ipfs/CID
 */
export async function postToIPFS(data: string): Promise<string> {
  if (config.attendify.ipfs.infuraId) {
    return postToIPFSInfura(data);
  } else if (config.attendify.ipfs.web3StorageToken) {
    return postToIPFSWeb3Storage(data);
  } else {
    throw Error("Missing IPFS provider credentials");
  }
}
