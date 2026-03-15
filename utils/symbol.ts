// utils/symbol.ts（サーバ専用：BIP32/bitcore を引かない）

import { SymbolFacade, KeyPair } from "symbol-sdk/symbol";

function hexToUint8(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export const NODE_URL = process.env.SYMBOL_NODE_URL || "https://sym-test.opening-line.jp:3001";

export async function createProofTransaction(
  privateKey: string,
  recipientAddress: string,
  messageContent: string
) {
  const facade = new SymbolFacade("testnet");

  const keyBytes = hexToUint8(privateKey);
  const keyPair = new KeyPair({ bytes: keyBytes } as any);

  const deadline = facade.network.fromDatetime(new Date(Date.now() + 2 * 60 * 60 * 1000)).timestamp;
  const cleanAddress = recipientAddress.replace(/-/g, "");

  const transaction = facade.transactionFactory.create({
    type: "transfer_transaction_v1",
    signerPublicKey: keyPair.publicKey.toString(),
    fee: BigInt(1000000),
    deadline,
    recipientAddress: cleanAddress,
    message: Uint8Array.from(Buffer.from(messageContent, "utf8")),
  });

  const signature = facade.signTransaction(keyPair, transaction);
  const jsonString = (facade.transactionFactory as any).constructor.attachSignature(transaction, signature);
  const payload = JSON.parse(jsonString).payload as string;

  return { transaction, signature, payload };
}

export async function announceTransaction(payload: string) {
  const url = `${NODE_URL}/transactions`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  return response.json();
}

export function getAddressFromPrivateKey(privateKey: string): string {
  const facade = new SymbolFacade("testnet");
  const keyBytes = hexToUint8(privateKey);
  const keyPair = new KeyPair({ bytes: keyBytes } as any);
  return facade.network.publicKeyToAddress(keyPair.publicKey).toString();
}
