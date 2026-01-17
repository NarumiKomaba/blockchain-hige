"use client";

import { useState, useEffect } from "react";
// We import our symbol utilities. 
// Note: Ensure symbol-sdk doesn't break in client-side bundle.
import {
  createProofTransaction,
  announceTransaction,
  getAccountProofs,
  getBlockTimestamp,
} from "../utils/symbol";

// Simple SHA256 helper using Web Crypto API
async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ProofSummary = {
  fileHash: string;
  txHash: string;
  proofTime: string;
  explorerUrl: string;
  thumbnailUrl: string;
};

type VerificationResult = {
  fileHash: string;
  proofTime: string;
  txHash: string;
  explorerUrl: string;
};

const DB_NAME = "shave-proof";
const STORE_NAME = "photos";

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "hash" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePhotoToDb(hash: string, file: File) {
  const db = await openPhotoDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      hash,
      blob: file,
      savedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function hexToUint8(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function decodeMessagePayload(payload?: string): string {
  if (!payload) return "";
  if (/^[0-9A-Fa-f]+$/.test(payload)) {
    return new TextDecoder().decode(hexToUint8(payload));
  }
  return payload;
}

export default function Home() {
  const [privateKey, setPrivateKey] = useState("");
  const [status, setStatus] = useState("");
  const [proofs, setProofs] = useState<any[]>([]);
  const [fileHash, setFileHash] = useState("");
  const [proofPhoto, setProofPhoto] = useState<File | null>(null);
  const [proofThumbnailUrl, setProofThumbnailUrl] = useState("");
  const [latestProof, setLatestProof] = useState<ProofSummary | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [verifyFileHash, setVerifyFileHash] = useState("");
  const [verifyThumbnailUrl, setVerifyThumbnailUrl] = useState("");
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationStatus, setVerificationStatus] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    return () => {
      if (proofThumbnailUrl) URL.revokeObjectURL(proofThumbnailUrl);
      if (verifyThumbnailUrl) URL.revokeObjectURL(verifyThumbnailUrl);
    };
  }, [proofThumbnailUrl, verifyThumbnailUrl]);

  // Load proofs if private key is present (assuming derivation of address)
  // For simplicity MVP, we might need the Address derived from PK to fetch proofs.
  // We'll update getAccountProofs to accept address.
  // We need a way to get Address from PK in the UI or fetch logic.
  // symbol-sdk has logic for this, we can add a helper in existing utils/symbol.ts
  // For now, we won't auto-fetch on mount unless we have an address.

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const hash = await sha256(file);
      setFileHash(hash);
      setProofPhoto(file);
      if (proofThumbnailUrl) URL.revokeObjectURL(proofThumbnailUrl);
      setProofThumbnailUrl(URL.createObjectURL(file));
      setStatus("ハッシュ化完了: " + hash.substring(0, 10) + "...");
    }
  };

  const handleVerifyFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const hash = await sha256(file);
      setVerifyFileHash(hash);
      if (verifyThumbnailUrl) URL.revokeObjectURL(verifyThumbnailUrl);
      setVerifyThumbnailUrl(URL.createObjectURL(file));
      setVerificationStatus("検証用ハッシュを計算しました。");
      setVerificationResult(null);
    }
  };

  const findProofTransaction = async (addr: string, targetHash: string) => {
    const txs = await getAccountProofs(addr);
    const matched = (txs || []).find((tx: any) => {
      const message = decodeMessagePayload(tx.transaction?.message?.payload);
      return message === targetHash;
    });
    return matched;
  };

  const handleShave = async () => {
    if (!privateKey || !fileHash || !proofPhoto) {
      setStatus("秘密鍵を入力し、写真を選択してください。");
      return;
    }

    setIsUploading(true);
    setStatus("処理中...");

    try {
      // 1. Derive Address (Quick/Dirty: we need a helper, or we rely on the utility returning it?)
      // We'll update utils/symbol.ts to export a "getAddress" helper or just pass PK to a "submit" function that handles it.
      // Current createProofTransaction takes recipient.
      // Let's modify logic: We need to know our own address to send to self.

      // Since I can't easily import "SymbolFacade" here without clutter, 
      // I'll assume usage of a new helper helper `getPublicAccount` if needed, 
      // or just trust the user to input address? No, user only inputs PK.
      // I will update symbol.ts in the next turn to include a `getAddressFromPrivateKey` helper.
      // For now, let's assume I can add it.

      // WAIT: I can't update symbol.ts in this same turn easily if I didn't plan it.
      // I'll write this page to expecting a `getAddressFromPrivateKey` from `../utils/symbol`.
      // I will update `symbol.ts` immediately after this.

      const { getAddressFromPrivateKey } = await import("../utils/symbol");
      const address = getAddressFromPrivateKey(privateKey);

      setStatus("トランザクション作成中...");
      const { payload } = await createProofTransaction(privateKey, address, fileHash);

      setStatus("トランザクション送信中...");
      // Payload is already hex string
      await announceTransaction(payload);
      await savePhotoToDb(fileHash, proofPhoto);

      setLatestProof({
        fileHash,
        txHash: "確認中...",
        proofTime: "確認中...",
        explorerUrl: "#",
        thumbnailUrl: proofThumbnailUrl,
      });

      setStatus("ブロック承認待ち...");
      let confirmedTx: any = null;
      for (let i = 0; i < 10; i += 1) {
        confirmedTx = await findProofTransaction(address, fileHash);
        if (confirmedTx) break;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (confirmedTx) {
        const blockTime = await getBlockTimestamp(confirmedTx.meta.height);
        const explorerUrl = `https://testnet.symbol.fyi/transactions/${confirmedTx.meta.hash}`;
        setLatestProof({
          fileHash,
          txHash: confirmedTx.meta.hash,
          proofTime: blockTime.toLocaleString("ja-JP"),
          explorerUrl,
          thumbnailUrl: proofThumbnailUrl,
        });
        setStatus("証明完了！");
        loadProofs(address);
      } else {
        setStatus("送信は完了しました。確認が遅延しています。");
      }

    } catch (e: any) {
      console.error(e);
      setStatus("エラー: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleVerify = async () => {
    if (!privateKey || !verifyFileHash) {
      setVerificationStatus("秘密鍵と写真を用意してください。");
      return;
    }
    setIsVerifying(true);
    setVerificationStatus("チェーン照合中...");
    try {
      const { getAddressFromPrivateKey } = await import("../utils/symbol");
      const address = getAddressFromPrivateKey(privateKey);
      const matchedTx = await findProofTransaction(address, verifyFileHash);
      if (!matchedTx) {
        setVerificationStatus("一致する証明が見つかりませんでした。");
        setVerificationResult(null);
        return;
      }
      const blockTime = await getBlockTimestamp(matchedTx.meta.height);
      const explorerUrl = `https://testnet.symbol.fyi/transactions/${matchedTx.meta.hash}`;
      setVerificationResult({
        fileHash: verifyFileHash,
        proofTime: blockTime.toLocaleString("ja-JP"),
        txHash: matchedTx.meta.hash,
        explorerUrl,
      });
      setVerificationStatus("一致する証明が見つかりました。");
    } catch (e: any) {
      console.error(e);
      setVerificationStatus("検証エラー: " + e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const loadProofs = async (addr: string) => {
    try {
      const txs = await getAccountProofs(addr);
      setProofs(txs || []);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 font-sans">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          Shave Proof
        </h1>
        <p className="text-gray-400">ブロックチェーンで刻む、毎日の身だしなみ</p>
      </header>

      <main className="max-w-md mx-auto space-y-8">
        {/* Wallet Section */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
          <label className="block text-sm font-medium mb-2 text-gray-300">Symbol秘密鍵 (テストネット)</label>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="テストネットの秘密鍵を入力"
          />
          <p className="text-xs text-red-400 mt-1">
            ※必ずテストネットの鍵を使用してください。
          </p>
        </div>

        {/* Action Section */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>

          <div className="text-center space-y-4">
            <div className="relative inline-block group">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer inline-flex items-center justify-center w-32 h-32 rounded-full bg-gray-700 hover:bg-gray-600 border-2 border-dashed border-gray-500 transition-all group-hover:border-blue-400"
              >
                {fileHash ? (
                  <span className="text-4xl">📸</span>
                ) : (
                  <span className="text-gray-400 text-sm">タップして撮影</span>
                )}
              </label>
            </div>

            {fileHash && (
              <div className="text-xs font-mono text-gray-400 break-all">
                ハッシュ値: {fileHash}
              </div>
            )}

            <button
              onClick={handleShave}
              disabled={isUploading || !fileHash || !privateKey}
              className={`w-full py-3 rounded-lg font-bold transition-all ${isUploading || !fileHash || !privateKey
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:scale-105 active:scale-95 text-white shadow-lg shadow-blue-500/30"
                }`}
            >
              {isUploading ? "証明中..." : "証明書を発行"}
            </button>

            <div className="text-sm text-yellow-400 min-h-[20px]">{status}</div>
          </div>
        </div>

        {latestProof && (
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 space-y-4">
            <h2 className="text-lg font-semibold">証明された情報</h2>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-700 bg-gray-900 flex items-center justify-center">
                {latestProof.thumbnailUrl ? (
                  <img
                    src={latestProof.thumbnailUrl}
                    alt="撮影した写真のサムネ"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-gray-500">No Image</span>
                )}
              </div>
              <div className="text-left text-xs text-gray-400 space-y-1">
                <div>
                  <span className="text-gray-500">写真ハッシュ:</span>
                  <div className="break-all font-mono text-gray-200">{latestProof.fileHash}</div>
                </div>
                <div>
                  <span className="text-gray-500">トランザクションハッシュ:</span>
                  <div className="break-all font-mono text-gray-200">{latestProof.txHash}</div>
                </div>
                <div>
                  <span className="text-gray-500">証明時刻:</span>
                  <div className="text-gray-200">{latestProof.proofTime}</div>
                </div>
                <div>
                  <a
                    href={latestProof.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 underline"
                  >
                    確認
                  </a>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              写真は端末内（IndexedDB）に保存し、チェーンにはハッシュのみ記録しています。
            </p>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">検証</h2>
            <span className="text-xs text-gray-500">写真から証明を照合</span>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleVerifyFileChange}
                className="text-xs text-gray-300"
              />
              {verifyThumbnailUrl && (
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-700">
                  <img
                    src={verifyThumbnailUrl}
                    alt="検証する写真"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
            {verifyFileHash && (
              <div className="text-xs font-mono text-gray-400 break-all">
                検証用ハッシュ: {verifyFileHash}
              </div>
            )}
            <button
              onClick={handleVerify}
              disabled={isVerifying || !verifyFileHash || !privateKey}
              className={`w-full py-3 rounded-lg font-bold transition-all ${isVerifying || !verifyFileHash || !privateKey
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:scale-105 active:scale-95 text-white shadow-lg shadow-emerald-500/30"
                }`}
            >
              {isVerifying ? "検証中..." : "検証する"}
            </button>
            <div className="text-sm text-yellow-400 min-h-[20px]">{verificationStatus}</div>
            {verificationResult && (
              <div className="text-sm text-gray-300 space-y-2">
                <div>
                  この写真は {verificationResult.proofTime} に証明済みです。
                </div>
                <div className="text-xs font-mono text-gray-400 break-all">
                  tx hash: {verificationResult.txHash}
                </div>
                <a
                  href={verificationResult.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 underline"
                >
                  Explorerで確認
                </a>
              </div>
            )}
          </div>
        </div>

        {/* History Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">証明履歴</h2>
            <button
              onClick={async () => {
                if (!privateKey) return;
                // Need logic to get address from PK again, or store it
                const { getAddressFromPrivateKey } = await import("../utils/symbol");
                const addr = getAddressFromPrivateKey(privateKey);
                loadProofs(addr);
              }}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              更新
            </button>
          </div>

          <div className="space-y-3">
            {proofs.length === 0 && (
              <div className="text-center text-gray-500 py-4">履歴がありません。</div>
            )}
            {proofs.map((tx: any, i) => (
              <div key={i} className="bg-gray-800 p-4 rounded-lg flex items-center justify-between border border-gray-700">
                <div>
                  <div className="text-sm font-bold text-white">
                    証明 #{proofs.length - i}
                  </div>
                  <div className="text-xs text-gray-400">
                    {/* Note: SDK returns UInt64 for height, need formatting */}
                    ブロック高: {tx.meta.height}
                  </div>
                  {/* Message decoding needed if binary, but we sent string. 
                       SDK raw fetch returns hex message usually 
                   */}
                </div>
                <div className="text-right">
                  <a
                    href={`https://testnet.symbol.fyi/transactions/${tx.meta.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-400 underline"
                  >
                    確認
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="mt-10 text-center text-xs text-gray-500">
        <a
          href="https://symbolplatform.com/"
          target="_blank"
          rel="noreferrer"
          className="text-blue-400 underline"
        >
          Powered by Symbol
        </a>
      </footer>
    </div>
  );
}
