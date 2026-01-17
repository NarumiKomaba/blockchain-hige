"use client";

import { useEffect, useState } from "react";

// Simple SHA256 helper using Web Crypto API
async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SYMBOL_EPOCH_ADJUSTMENT = 1615853185000;

function formatSymbolTimestamp(timestamp?: string | number): string {
  if (timestamp === undefined || timestamp === null) return "";
  const numeric = Number(timestamp);
  if (Number.isNaN(numeric)) return "";
  return new Date(numeric + SYMBOL_EPOCH_ADJUSTMENT).toLocaleString("ja-JP");
}

type StoredPhoto = {
  hash: string;
  blob: Blob;
  createdAt: number;
};

const DB_NAME = "shave-proof";
const STORE_NAME = "photos";

async function openPhotoDb(): Promise<IDBDatabase> {
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

async function savePhotoToIndexedDb(hash: string, file: File) {
  const db = await openPhotoDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const record: StoredPhoto = { hash, blob: file, createdAt: Date.now() };
    store.put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

type ProofApiOk = {
  ok: true;
  nodeUrl?: string;
  recipientAddress: string;
  announced: any;
};

type ProofApiNg = {
  ok: false;
  error: string;
  details?: any;
};

type ProofsApiOk = {
  ok: true;
  nodeUrl: string;
  address: string;
  items: Array<{
    hash: string;
    height: string | number;
    timestamp?: string | number;
    recipientAddress?: string;
    messageHex?: string;
    messageText?: string;
  }>;
};

export default function Home() {
  const [status, setStatus] = useState("");
  const [proofs, setProofs] = useState<ProofsApiOk["items"]>([]);
  const [fileHash, setFileHash] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [address, setAddress] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [proofPhotoUrl, setProofPhotoUrl] = useState<string | null>(null);
  const [proofHash, setProofHash] = useState("");
  const [latestProof, setLatestProof] = useState<ProofsApiOk["items"][number] | null>(null);
  const [verifyPhotoUrl, setVerifyPhotoUrl] = useState<string | null>(null);
  const [verifyHash, setVerifyHash] = useState("");
  const [verifyResult, setVerifyResult] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMatch, setVerifyMatch] = useState<ProofsApiOk["items"][number] | null>(null);

  useEffect(() => {
    if (!selectedPhotoUrl) return;
    return () => {
      URL.revokeObjectURL(selectedPhotoUrl);
    };
  }, [selectedPhotoUrl]);

  useEffect(() => {
    if (!proofPhotoUrl) return;
    return () => {
      URL.revokeObjectURL(proofPhotoUrl);
    };
  }, [proofPhotoUrl]);

  useEffect(() => {
    if (!verifyPhotoUrl) return;
    return () => {
      URL.revokeObjectURL(verifyPhotoUrl);
    };
  }, [verifyPhotoUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const hash = await sha256(file);
      setSelectedFile(file);
      setFileHash(hash);
      setStatus("ハッシュ化完了: " + hash.substring(0, 10) + "...");
      setSelectedPhotoUrl(URL.createObjectURL(file));
    }
  };

  const loadProofs = async () => {
    try {
      const res = await fetch("/api/proofs");
      const json = (await res.json()) as ProofsApiOk | ProofApiNg;

      if (!res.ok || (json as any).ok === false) {
        setStatus(`履歴取得エラー: ${(json as any)?.error ?? res.status}`);
        return;
      }

      const ok = json as ProofsApiOk;
      setAddress(ok.address); // ✅ APIが返す address を採用
      setProofs(ok.items || []);
      if (proofHash) {
        const matched = ok.items.find((item) => item.messageText === proofHash) ?? null;
        setLatestProof(matched);
      }
      setStatus("履歴を更新しました。");
    } catch (e: any) {
      setStatus("履歴取得エラー: " + (e?.message ?? String(e)));
    }
  };

  const handleShave = async () => {
    if (!fileHash) {
      setStatus("写真を選択してください。");
      return;
    }

    setIsUploading(true);
    setStatus("証明中...");
    setProofHash(fileHash);
    setLatestProof(null);
    setProofPhotoUrl(selectedPhotoUrl);

    if (selectedFile) {
      try {
        await savePhotoToIndexedDb(fileHash, selectedFile);
      } catch (e: any) {
        console.warn("IndexedDB save failed:", e);
      }
    }

    try {
      const res = await fetch("/api/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageContent: fileHash }),
      });

      const json = (await res.json()) as ProofApiOk | ProofApiNg;

      if (!res.ok || json.ok === false) {
        setStatus(`APIエラー(${res.status}): ${(json as any)?.error ?? "unknown"}`);
        return;
      }

      // ✅ 宛先（=記録先）を保存
      setAddress(json.recipientAddress);

      setStatus(`送信完了！ ${json.announced?.message ?? ""}`);

      // confirmed 反映まで少し待ってから取得
      setTimeout(() => {
        loadProofs();
      }, 5000);
    } catch (e: any) {
      setStatus("エラー: " + (e?.message ?? String(e)));
    } finally {
      setIsUploading(false);
    }
  };

  const handleVerifyFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const hash = await sha256(file);
      setVerifyHash(hash);
      setVerifyPhotoUrl(URL.createObjectURL(file));
      setVerifyResult("");
      setVerifyMatch(null);
    }
  };

  const handleVerify = async () => {
    if (!verifyHash) {
      setVerifyResult("検証する写真を選択してください。");
      return;
    }

    setIsVerifying(true);
    setVerifyResult("チェーンと照合中...");
    setVerifyMatch(null);

    try {
      const res = await fetch("/api/proofs");
      const json = (await res.json()) as ProofsApiOk | ProofApiNg;

      if (!res.ok || json.ok === false) {
        setVerifyResult(`検証エラー: ${(json as any)?.error ?? res.status}`);
        return;
      }

      const ok = json as ProofsApiOk;
      const matched = ok.items.find((item) => item.messageText === verifyHash);

      if (!matched) {
        setVerifyResult("一致する証明が見つかりませんでした。");
        return;
      }

      const formatted = formatSymbolTimestamp(matched.timestamp);
      setVerifyResult(`この写真は ${formatted || "不明"} に証明済みです。`);
      setVerifyMatch(matched);
    } catch (e: any) {
      setVerifyResult("検証エラー: " + (e?.message ?? String(e)));
    } finally {
      setIsVerifying(false);
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
        {/* Info Section */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
          <div className="text-sm text-gray-300">
            このアプリは <span className="font-semibold">サーバ側の秘密鍵（env）</span>で署名し、Symbolテストネットに記録します。
          </div>
          <p className="text-xs text-yellow-400 mt-2">
            ※デモ用途のため、鍵は必ずテストネット用を使用してください。
          </p>

          {address && (
            <div className="mt-3 text-xs text-gray-400 break-all">
              記録先アドレス: <span className="font-mono">{address}</span>
            </div>
          )}
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
                {selectedPhotoUrl ? (
                  <span className="text-4xl">📸</span>
                ) : (
                  <span className="text-gray-400 text-sm">タップして撮影</span>
                )}
              </label>
            </div>

            {selectedPhotoUrl && (
              <img
                src={selectedPhotoUrl}
                alt="撮影した写真のサムネイル"
                className="mx-auto w-40 h-40 object-cover rounded-lg border border-gray-600"
              />
            )}

            {fileHash && (
              <div className="text-xs font-mono text-gray-400 break-all">
                ハッシュ値: {fileHash}
              </div>
            )}

            <button
              onClick={handleShave}
              disabled={isUploading || !fileHash}
              className={`w-full py-3 rounded-lg font-bold transition-all ${
                isUploading || !fileHash
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:scale-105 active:scale-95 text-white shadow-lg shadow-blue-500/30"
              }`}
            >
              {isUploading ? "証明中..." : "証明書を発行"}
            </button>

            <div className="text-sm text-yellow-400 min-h-[20px]">{status}</div>
          </div>
        </div>

        {/* Proof Result Section */}
        {proofHash && (
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">証明情報</h2>
              {latestProof?.hash && (
                <a
                  href={`https://testnet.symbol.fyi/transactions/${latestProof.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 underline"
                >
                  確認
                </a>
              )}
            </div>

            {proofPhotoUrl && (
              <img
                src={proofPhotoUrl}
                alt="証明に使用した写真のサムネイル"
                className="w-full h-48 object-cover rounded-lg border border-gray-600"
              />
            )}

            <dl className="space-y-2 text-sm text-gray-300">
              <div>
                <dt className="text-xs text-gray-500">写真ハッシュ（SHA-256）</dt>
                <dd className="font-mono break-all">{proofHash}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">トランザクションハッシュ</dt>
                <dd className="font-mono break-all">
                  {latestProof?.hash ?? "確認中..."}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">証明時刻</dt>
                <dd>{latestProof?.timestamp ? formatSymbolTimestamp(latestProof.timestamp) : "確認中..."}</dd>
              </div>
            </dl>
          </div>
        )}

        {/* Verify Section */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">検証</h2>
            <span className="text-xs text-gray-500">後から写真を選び直して照合</span>
          </div>

          <div className="flex flex-col items-center gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={handleVerifyFileChange}
              className="text-xs text-gray-300"
            />
            {verifyPhotoUrl && (
              <img
                src={verifyPhotoUrl}
                alt="検証する写真のサムネイル"
                className="w-32 h-32 object-cover rounded-lg border border-gray-600"
              />
            )}
            {verifyHash && (
              <div className="text-xs font-mono text-gray-400 break-all">
                ハッシュ値: {verifyHash}
              </div>
            )}
          </div>

          <button
            onClick={handleVerify}
            disabled={isVerifying || !verifyHash}
            className={`w-full py-3 rounded-lg font-bold transition-all ${
              isVerifying || !verifyHash
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:scale-105 active:scale-95 text-white shadow-lg shadow-emerald-500/30"
            }`}
          >
            {isVerifying ? "検証中..." : "検証"}
          </button>

          {verifyResult && (
            <div className="text-sm text-yellow-400 min-h-[20px]">{verifyResult}</div>
          )}

          {verifyMatch?.hash && (
            <div className="text-xs text-gray-400 break-all">
              tx hash: {verifyMatch.hash}{" "}
              <a
                href={`https://testnet.symbol.fyi/transactions/${verifyMatch.hash}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 underline"
              >
                確認
              </a>
            </div>
          )}
        </div>

        {/* History Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">証明履歴</h2>
            <button
              onClick={loadProofs}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              更新
            </button>
          </div>

          <div className="space-y-3">
            {proofs.length === 0 && (
              <div className="text-center text-gray-500 py-4">履歴がありません。</div>
            )}

            {proofs.map((tx, i) => (
              <div
                key={tx.hash ?? i}
                className="bg-gray-800 p-4 rounded-lg border border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">証明 #{proofs.length - i}</div>
                    <div className="text-xs text-gray-400">ブロック高: {String(tx.height ?? "")}</div>
                  </div>

                  <div className="text-right">
                    {/* ✅ hash は tx.hash */}
                    <a
                      href={`https://testnet.symbol.fyi/transactions/${tx.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-400 underline"
                    >
                      確認
                    </a>
                  </div>
                </div>

                {/* ✅ messageText（=写真ハッシュ）を表示 */}
                {tx.messageText && (
                  <div className="mt-2 text-xs font-mono text-gray-400 break-all">
                    message: {tx.messageText}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
