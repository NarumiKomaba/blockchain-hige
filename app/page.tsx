"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPhoto, putPhoto } from "@/lib/photoStore";

// Simple SHA256 helper using Web Crypto API
async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

function formatTimestamp(timestampMs?: number | null): string | null {
  if (!timestampMs || !Number.isFinite(timestampMs)) return null;
  return new Date(timestampMs).toLocaleString("ja-JP", { hour12: false });
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
    timestampMs?: number | null;
    timestampIso?: string | null;
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || !e.target.files[0]) return;

      const file = e.target.files[0];

      // 1) SHA256
      const hash = await sha256(file);
      setFileHash(hash);

      // 2) IndexedDBへ保存（hashをキー）
      await putPhoto({
        hash,
        createdAt: Date.now(),
        blob: file, // FileはBlobとして保存OK
      });

      // 3) プレビュー表示
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      setStatus("ハッシュ化＆端末保存完了: " + hash.substring(0, 10) + "...");
    } catch (e: any) {
      setStatus("ファイル処理エラー: " + (e?.message ?? String(e)));
    }
  };

  const loadProofs = useCallback(async () => {
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
      setStatus("履歴を更新しました。");

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
  }, []);

  useEffect(() => {
    void loadProofs();
  }, [loadProofs]);

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

      setStatus(`送信完了！ ${ok.announced?.message ?? ""}`);

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
          Shave Proof
        </h1>
        <p className="text-gray-400">ブロックチェーンで刻む、毎日の身だしなみ</p>
      </header>

      <main className="max-w-md mx-auto space-y-8">
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
                {fileHash ? <span className="text-4xl">📸</span> : <span className="text-gray-400 text-sm">タップして撮影</span>}
              </label>
            </div>

            {fileHash && (
              <div className="text-xs font-mono text-gray-400 break-all">
                ハッシュ値: {fileHash}
              </div>
            )}

            {/* 発行セクションのプレビュー表示 */}
            {previewUrl && (
              <div className="pt-2">
                <img src={previewUrl} alt="preview" className="w-full rounded-lg border border-gray-700" />
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
              const timestampLabel = formatTimestamp(tx.timestampMs);

              return (
                <div
                  key={tx.hash ?? i}
                  className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-4 sm:flex-1">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0">
                      {photoHash && localPhotoUrl ? (
                        <img
                          src={localPhotoUrl}
                          alt="saved photo"
                          className="w-full h-full object-cover rounded-lg border border-gray-700"
                        />
                      ) : (
                        <div className="w-full h-full rounded-lg border border-gray-700 bg-gray-900 flex items-center justify-center text-xs text-gray-500">
                          画像なし
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">
                        証明 #{proofs.length - i}
                        {timestampLabel && <span className="ml-2 text-xs text-gray-400">登録日時: {timestampLabel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <a
                      href={`https://testnet.symbol.fyi/transactions/${tx.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center text-xs text-blue-400 underline"
                    >
                      確認
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
