import type { Client, TxRequest, TxResponse, Transaction } from "xrpl";
import { XrplError } from "xrpl";
import type { BaseTransaction } from "xrpl/dist/npm/models/transactions/common";

// Approximate time for a ledger to close, in milliseconds
const LEDGER_CLOSE_TIME = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/*
 * The core logic of reliable submission. This polls the ledger until the result of the
 * transaction can be considered final, meaning it has either been included in a
 * validated ledger, or the transaction's lastLedgerSequence has been surpassed by the
 * latest ledger sequence (meaning it will never be included in a validated ledger).
 * 
 * Based on https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/src/sugar/submit.ts
 */

export async function waitForFinalTransactionOutcome<
  T extends BaseTransaction = Transaction
>(client: Client, txHash: string, lastLedger: number): Promise<TxResponse<T>> {
  try {
    const txResponse = await client.request<TxRequest, TxResponse<T>>({
      command: "tx",
      transaction: txHash,
    });
    if (txResponse.result.validated) {
      return txResponse;
    }
  } catch (error) {
    const message = (error as any).data.error as string;
    if (message !== "txnNotFound") {
      throw error;
    }
  }

  await sleep(LEDGER_CLOSE_TIME);

  const latestLedger = await client.getLedgerIndex();
  if (lastLedger < latestLedger) {
    throw new XrplError(
      `The latest ledger sequence ${latestLedger} is greater than the transaction's LastLedgerSequence (${lastLedger}).`
    );
  }

  return waitForFinalTransactionOutcome<T>(client, txHash, lastLedger);
}
