import { SymbolFacade, KeyPair } from 'symbol-sdk/symbol';
import { NODE_URL } from './symbolConfig';

// Simple hex to uint8 helper to avoid importing from SDK root
function hexToUint8(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Creates a Transfer Transaction with a message (Proof).
 * @param privateKey - Hex string of the signer's private key.
 * @param recipientAddress - Recipient address (self).
 * @param messageContent - The content to put in the message (Photo Hash).
 */
export async function createProofTransaction(
    privateKey: string,
    recipientAddress: string,
    messageContent: string
) {
    const facade = new SymbolFacade('testnet');
    // Use manual key pair creation to avoid importing PrivateKey causing bitcore-lib conflict
    const keyBytes = hexToUint8(privateKey);
    const keyPair = new KeyPair({ bytes: keyBytes } as any);

    // Calculate deadline (2 hours)
    const deadline = facade.network.fromDatetime(new Date(Date.now() + 2 * 60 * 60 * 1000)).timestamp;

    // Clean address (remove dashes)
    const cleanAddress = recipientAddress.replace(/-/g, '');

    // Create transaction
    const transaction = facade.transactionFactory.create({
        type: 'transfer_transaction_v1', // Correct v3 type
        signerPublicKey: keyPair.publicKey.toString(),
        fee: BigInt(1000000),
        deadline: deadline,
        recipientAddress: cleanAddress,
        message: new Uint8Array(new TextEncoder().encode(messageContent))
    });

    // Sign
    const signature = facade.signTransaction(keyPair, transaction);

    // Attach signature to get JSON payload string
    const jsonString = (facade.transactionFactory as any).constructor.attachSignature(transaction, signature);

    // Parse JSON to get hex payload
    const jsonObj = JSON.parse(jsonString);
    const payload = jsonObj.payload; // Hex string

    return {
        transaction,
        signature,
        payload // String
    };
}

/**
 * Announces a transaction to the network.
 * @param payload - Hex string of the signed transaction payload.
 */
export async function announceTransaction(payload: string) {
    const url = '/api/transactions';
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
    });

    return response.json();
}

/**
 * Fetch transactions for an account to show history.
 * @param address - Raw address string.
 */
export async function getAccountProofs(address: string) {
    // If address has dashes, remove them? API handles both usually but clean is safer
    const cleanAddress = address.replace(/-/g, '');
    const url = `${NODE_URL}/transactions/confirmed?address=${cleanAddress}&order=desc&type=16724`;
    const res = await fetch(url);
    const data = await res.json();
    return data.data;
}

/**
 * Derives address from private key.
 * @param privateKey 
 */
export function getAddressFromPrivateKey(privateKey: string): string {
    const facade = new SymbolFacade('testnet');
    const keyBytes = hexToUint8(privateKey);
    const keyPair = new KeyPair({ bytes: keyBytes } as any);
    return facade.network.publicKeyToAddress(keyPair.publicKey).toString();
}
