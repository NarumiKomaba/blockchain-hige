// lib/symbolProof.ts — Symbol SDK wrapper for server-side proof generation
import { SymbolFacade, KeyPair } from "symbol-sdk/symbol";

function hexToUint8(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function getAddressFromPrivateKey(privateKey: string): string {
  const facade = new SymbolFacade("testnet");
  const keyBytes = hexToUint8(privateKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyPair = new KeyPair({ bytes: keyBytes } as any);
  return facade.network.publicKeyToAddress(keyPair.publicKey).toString();
}

export function createProofPayload(
  privateKey: string,
  messageContent: string,
  recipientAddressArg?: string
): { recipientAddress: string; payload: string } {
  if (!privateKey) throw new Error("SYMBOL_PRIVATE_KEY is not set");
  if (!messageContent) throw new Error("messageContent is required");

  const facade = new SymbolFacade("testnet");
  const keyBytes = hexToUint8(privateKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyPair = new KeyPair({ bytes: keyBytes } as any);

  const recipientAddress =
    recipientAddressArg ||
    facade.network.publicKeyToAddress(keyPair.publicKey).toString();

  const deadline = facade.network.fromDatetime(
    new Date(Date.now() + 2 * 60 * 60 * 1000)
  ).timestamp;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonString =
    (facade.transactionFactory as any).constructor.attachSignature(transaction, signature);
  const payload = JSON.parse(jsonString).payload as string;

  return { recipientAddress, payload };
}
