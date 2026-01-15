import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair } from 'symbol-sdk/symbol';

const facade = new SymbolFacade('testnet');
const key = new PrivateKey('1111111111111111111111111111111111111111111111111111111111111111');
const kp = new KeyPair(key);
const deadline = facade.network.fromDatetime(new Date()).timestamp;

try {
    const t = 'transfer_transaction_v1';
    console.log(`Trying type: ${t}`);

    // Address without dashes
    const address = 'TCDM23OAPJ2O6IJQ7IQ7R72L2O3P757X3O5F5GI';

    const tx = facade.transactionFactory.create({
        type: t,
        signerPublicKey: kp.publicKey.toString(),
        fee: 1000000n,
        deadline: deadline,
        recipientAddress: address,
        message: new Uint8Array([0])
    });
    console.log(`SUCCESS with ${t}`);
    const sig = facade.signTransaction(kp, tx);
    const attached = facade.transactionFactory.constructor.attachSignature(tx, sig);
    console.log('Attached Type:', typeof attached);
    console.log('Attached:', JSON.stringify(attached));

    // Check if we can get payload
    // attached is typically the JSON object.

} catch (e) {
    console.log(`FAILED: ${e.message}`);
    console.log(e.stack);
}
