"use client";

import { useEffect, useRef, useState } from "react";
import { getPhoto, putPhoto } from "@/lib/photoStore";
import { CameraCapture } from "@/components/CameraCapture";
import { VerifySection } from "@/components/VerifySection";

// Simple SHA256 helper using Web Crypto API
async function sha256(data: Blob): Promise<string> {
  const buffer = await data.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Symbol Epoch (approximate for Testnet/Mainnet adjustment if needed)
// For now, assuming raw timestamp needs epoch adjustment.
// If the node returns relative time, we need to add the epoch.
// Symbol Mainnet Epoch: 1615853185000
// Symbol Testnet Epoch (2022 reset): 1667250467000
const SYMBOL_EPOCH = 1667250467000;

function formatSymbolDate(timestamp?: string | number): string {
  if (!timestamp) return "Unknown Date";
  // timestamp is usually milliseconds from epoch
  const ms = Number(timestamp);
  // Simple check: if year is 1970, add epoch.
  // 1 year in ms ~ 3e10. 
  // If ms < 1.6e12 (approx 2020), it's likely relative.
  const t = ms < 1600000000000 ? ms + SYMBOL_EPOCH : ms;
  return new Date(t).toLocaleString("ja-JP");
}

/**
 * messageText から 64桁 hex を抜き出す
 * - 64hex が複数ある場合は最初の1つ
 */
function extractPhotoHash(messageText?: string): string | null {
  if (!messageText) return null;
  const m = messageText.match(/[0-9a-fA-F]{64}/);
  return m ? m[0].toLowerCase() : null;
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
  count?: number;
  items: Array<{
    hash: string; // tx hash
    height: string | number;
    timestamp?: string | number;
    recipientAddress?: string;
    messageHex?: string;
    messageText?: string; // chain message (contains photo hash)
  }>;
};

export default function Home() {
  const [status, setStatus] = useState("");
  const [proofs, setProofs] = useState<ProofsApiOk["items"]>([]);
  const [fileHash, setFileHash] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [address, setAddress] = useState<string>("");

  // 撮影直後のプレビュー用URL
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // 履歴カードに表示する写真URL（tx.hash → objectURL）
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  // objectURL 破棄用
  const previewUrlRef = useRef<string>("");
  const photoUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    photoUrlsRef.current = photoUrls;
  }, [photoUrls]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      for (const url of Object.values(photoUrlsRef.current)) URL.revokeObjectURL(url);
    };
  }, []);

  const handleCapture = async (blob: Blob) => {
    try {
      // 1) SHA256
      const hash = await sha256(blob);
      setFileHash(hash);

      // 2) IndexedDBへ保存（hashをキー）
      await putPhoto({
        hash,
        createdAt: Date.now(),
        blob,
      });

      // 3) プレビュー表示
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);

      setStatus("ハッシュ化＆端末保存完了: " + hash.substring(0, 10) + "...");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus("撮影処理エラー: " + message);
    }
  };

  const loadProofs = async () => {
    try {
      const res = await fetch("/api/proofs", { cache: "no-store" });
      const json = (await res.json()) as ProofsApiOk | ProofApiNg;

      if (!res.ok || (json as any)?.ok === false) {
        setStatus(`履歴取得エラー: ${(json as any)?.error ?? res.status}`);
        return;
      }

      const ok = json as ProofsApiOk;
      setAddress(ok.address);
      setProofs(ok.items || []);
      // setStatus("履歴を更新しました。"); // Success message removed per user request

      // 既存の履歴写真URLを解放
      for (const url of Object.values(photoUrlsRef.current)) URL.revokeObjectURL(url);

      // 履歴から写真を引き当ててURL生成
      const nextPhotoUrls: Record<string, string> = {};
      for (const tx of ok.items || []) {
        const photoHash = extractPhotoHash(tx.messageText);
        if (!photoHash) continue;

        const rec = await getPhoto(photoHash);
        if (!rec?.blob) continue;

        nextPhotoUrls[tx.hash] = URL.createObjectURL(rec.blob);
      }

      setPhotoUrls(nextPhotoUrls);
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

    try {
      const res = await fetch("/api/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageContent: fileHash }),
      });

      const json = (await res.json()) as ProofApiOk | ProofApiNg;

      if (!res.ok || (json as any)?.ok === false) {
        setStatus(`APIエラー(${res.status}): ${(json as any)?.error ?? "unknown"}`);
        return;
      }

      const ok = json as ProofApiOk;

      // ✅ 宛先（=記録先）を保存
      setAddress(ok.recipientAddress);

      // setStatus(`送信完了！ ${ok.announced?.message ?? ""}`); // Removed success message

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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 font-sans">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          HIGE
        </h1>
        <p className="text-gray-400">ブロックチェーンで刻む、毎日の身だしなみ証明</p>
      </header>

      <main className="max-w-md mx-auto space-y-8">
        {/* Action Section */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>

          <div className="text-center space-y-4">
            <CameraCapture
              onCapture={handleCapture}
              previewUrl={previewUrl}
            />

            {fileHash && (
              <div className="text-xs font-mono text-gray-400 break-all">
                ハッシュ値: {fileHash}
              </div>
            )}

            <button
              onClick={handleShave}
              disabled={isUploading || !fileHash}
              className={`w-full py-3 rounded-lg font-bold transition-all ${isUploading || !fileHash
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:scale-105 active:scale-95 text-white shadow-lg shadow-blue-500/30"
                }`}
            >
              {isUploading ? "証明中..." : "証明書を発行"}
            </button>

            <div className="text-sm text-yellow-400 min-h-[20px]">{status}</div>
          </div>
        </div>

        {/* History Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">証明履歴</h2>
            <button onClick={loadProofs} className="text-sm text-blue-400 hover:text-blue-300">
              更新
            </button>
          </div>

          <div className="space-y-3">
            {proofs.length === 0 && <div className="text-center text-gray-500 py-4">履歴がありません。</div>}

            {proofs.map((tx, i) => {
              const photoHash = extractPhotoHash(tx.messageText);
              const localPhotoUrl = photoUrls[tx.hash];

              return (
                <div key={tx.hash ?? i} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <div className="flex flex-col gap-2">
                    {/* Header: Date + Link */}
                    <div className="flex justify-between items-center border-b border-gray-700 pb-1 mb-2">
                      <div className="text-sm font-bold text-white">
                        {formatSymbolDate(tx.timestamp)}
                      </div>
                      <a
                        href={`https://testnet.symbol.fyi/transactions/${tx.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Symbolブロックチェーンで確認"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    </div>

                    <div className="flex gap-3">
                      {/* Left: Thumbnail */}
                      <div className="flex-shrink-0">
                        {photoHash && localPhotoUrl ? (
                          <img src={localPhotoUrl} alt="saved photo" className="w-16 h-16 rounded object-cover" />
                        ) : (
                          <div className="w-16 h-16 rounded bg-gray-700 flex items-center justify-center text-xs text-gray-500">
                            No Img
                          </div>
                        )}
                      </div>

                      {/* Right: Info */}
                      <div className="flex-grow flex flex-col justify-center min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">Hash:</span>
                        </div>
                        {/* messageText (Hash) */}
                        <div className="text-xs font-mono text-gray-300 truncate bg-gray-900 p-1 rounded mb-2">
                          {tx.messageText || "No content"}
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Verify & Tamper Demo Section */}
        <VerifySection
          proofs={proofs}
          sha256={sha256}
          formatDate={formatSymbolDate}
        />
      </main>
    </div>
  );
}
