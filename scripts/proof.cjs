// scripts/proof.cjs
const { SymbolFacade, KeyPair } = require("symbol-sdk/symbol");

function hexToUint8(hex) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function main() {
  const privateKey = process.env.SYMBOL_PRIVATE_KEY;
  const messageContent = process.argv[2] || "";
  const recipientAddressArg = process.argv[3] || "";

  if (!privateKey) throw new Error("SYMBOL_PRIVATE_KEY is not set");
  if (!messageContent) throw new Error("messageContent is required");

  const facade = new SymbolFacade("testnet");
  const keyBytes = hexToUint8(privateKey);
  const keyPair = new KeyPair({ bytes: keyBytes });

  const recipientAddress =
    recipientAddressArg || facade.network.publicKeyToAddress(keyPair.publicKey).toString();

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
  const jsonString = facade.transactionFactory.constructor.attachSignature(transaction, signature);
  const payload = JSON.parse(jsonString).payload;

  // stdout にJSONで返す（Next API が読む）
  process.stdout.write(JSON.stringify({ recipientAddress, payload }));
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e));
  process.exit(1);
});
