"use client";

import { useState, useEffect } from "react";
// We import our symbol utilities. 
// Note: Ensure symbol-sdk doesn't break in client-side bundle.
import { createProofTransaction, announceTransaction, getAccountProofs } from "../utils/symbol";
import type { DebugLogEntry } from "../utils/symbol";

// Simple SHA256 helper using Web Crypto API
async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Home() {
  const [privateKey, setPrivateKey] = useState("");
  const [status, setStatus] = useState("");
  const [proofs, setProofs] = useState<any[]>([]);
  const [fileHash, setFileHash] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [debugLogs, setDebugLogs] = useState<(DebugLogEntry & { time: string })[]>([]);

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
      setStatus("ハッシュ化完了: " + hash.substring(0, 10) + "...");
    }
  };

  const handleShave = async () => {
    if (!privateKey || !fileHash) {
      setStatus("秘密鍵を入力し、写真を選択してください。");
      return;
    }

    setIsUploading(true);
    setStatus("処理中...");
    setDebugLogs([]);

    const addDebugLog = (entry: DebugLogEntry) => {
      setDebugLogs((prev) => [...prev, { ...entry, time: new Date().toISOString() }]);
    };

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
      const { payload } = await createProofTransaction(privateKey, address, fileHash, addDebugLog);

      setStatus("トランザクション送信中...");
      // Payload is already hex string
      const res = await announceTransaction(payload, addDebugLog);
      setStatus("送信完了! " + JSON.stringify(res));

      // Refresh proofs after a delay
      setTimeout(() => {
        loadProofs(address);
      }, 5000);

    } catch (e: any) {
      console.error(e);
      addDebugLog({
        stage: "handleShave:error",
        error: e?.message ?? String(e)
      });
      setStatus("エラー: " + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const loadProofs = async (addr: string) => {
    try {
      const txs = await getAccountProofs(addr, (entry) =>
        setDebugLogs((prev) => [...prev, { ...entry, time: new Date().toISOString() }])
      );
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

        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">通信ログ</h2>
            <button
              type="button"
              onClick={() => setDebugLogs([])}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              クリア
            </button>
          </div>
          {debugLogs.length === 0 ? (
            <div className="text-xs text-gray-500">ログはまだありません。</div>
          ) : (
            <div className="space-y-3 text-xs text-gray-300">
              {debugLogs.map((log, index) => (
                <div key={`${log.stage}-${index}`} className="border border-gray-700 rounded-lg p-3 bg-gray-900/60">
                  <div className="flex justify-between text-gray-400 mb-2">
                    <span>{log.stage}</span>
                    <span>{new Date(log.time).toLocaleString()}</span>
                  </div>
                  {log.request && (
                    <div className="mb-2">
                      <div className="text-gray-500 mb-1">送信内容</div>
                      <pre className="whitespace-pre-wrap break-all">{JSON.stringify(log.request, null, 2)}</pre>
                    </div>
                  )}
                  {log.response && (
                    <div className="mb-2">
                      <div className="text-gray-500 mb-1">受信内容</div>
                      <pre className="whitespace-pre-wrap break-all">{JSON.stringify(log.response, null, 2)}</pre>
                    </div>
                  )}
                  {log.error && (
                    <div>
                      <div className="text-red-400 mb-1">エラー</div>
                      <pre className="whitespace-pre-wrap break-all">{log.error}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
    </div>
  );
}
