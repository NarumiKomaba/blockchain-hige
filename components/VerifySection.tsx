"use client";

import { useRef, useState } from "react";
import { getAllPhotos } from "@/lib/photoStore";

type ProofItem = {
  hash: string;
  height: string | number;
  timestamp?: string | number;
  messageText?: string;
};

type VerifySectionProps = {
  readonly proofs: readonly ProofItem[];
  readonly sha256: (data: Blob) => Promise<string>;
  readonly formatDate: (timestamp?: string | number) => string;
};

type VerifyResult = {
  status: "match" | "mismatch";
  fileHash: string;
  matchedTx?: ProofItem;
};

type TamperResult = {
  originalHash: string;
  tamperedHash: string;
  originalUrl: string;
  tamperedUrl: string;
};

function extractPhotoHash(messageText?: string): string | null {
  if (!messageText) return null;
  const m = messageText.match(/[0-9a-fA-F]{64}/);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Canvas上で1ピクセルの色を変更して改ざん画像を生成
 */
async function tamperImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(bitmap, 0, 0);

  // 目に見える改ざん: 赤い半透明の斜線 + "TAMPERED" テキスト
  const w = bitmap.width;
  const h = bitmap.height;
  const lineWidth = Math.max(3, Math.floor(Math.min(w, h) / 40));

  ctx.strokeStyle = "rgba(255, 40, 40, 0.7)";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";

  // 対角線を2本描画
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, h);
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();

  // "TAMPERED" テキスト
  const fontSize = Math.max(16, Math.floor(Math.min(w, h) / 8));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 40, 40, 0.8)";
  ctx.fillText("TAMPERED", w / 2, h / 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}

export function VerifySection({ proofs, sha256, formatDate }: VerifySectionProps) {
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tamperResult, setTamperResult] = useState<TamperResult | null>(null);
  const [isTampering, setIsTampering] = useState(false);
  const [tamperError, setTamperError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL cleanup refs
  const tamperUrlsRef = useRef<string[]>([]);

  const cleanupTamperUrls = () => {
    for (const url of tamperUrlsRef.current) URL.revokeObjectURL(url);
    tamperUrlsRef.current = [];
  };

  const handleVerifyFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const file = e.target.files[0];
      const fileHash = await sha256(file);

      // proofs のメッセージ内の64hex とマッチするか
      const matched = proofs.find((tx) => {
        const chainHash = extractPhotoHash(tx.messageText);
        return chainHash === fileHash;
      });

      setVerifyResult({
        status: matched ? "match" : "mismatch",
        fileHash,
        matchedTx: matched,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVerifyResult({
        status: "mismatch",
        fileHash: "計算エラー: " + message,
      });
    } finally {
      setIsVerifying(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTamperDemo = async () => {
    setIsTampering(true);
    setTamperResult(null);
    setTamperError("");
    cleanupTamperUrls();

    try {
      // IndexedDB から最新の写真を取得
      const photos = await getAllPhotos();
      if (photos.length === 0) {
        setTamperError("端末に保存された画像がありません。先に撮影してください。");
        return;
      }

      const latest = photos[0];
      const originalHash = latest.hash;

      // 改ざん画像を生成
      const tamperedBlob = await tamperImage(latest.blob);
      const tamperedHash = await sha256(tamperedBlob);

      // プレビューURL生成
      const originalUrl = URL.createObjectURL(latest.blob);
      const tamperedUrl = URL.createObjectURL(tamperedBlob);
      tamperUrlsRef.current = [originalUrl, tamperedUrl];

      setTamperResult({
        originalHash,
        tamperedHash,
        originalUrl,
        tamperedUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTamperError("デモ実行エラー: " + message);
    } finally {
      setIsTampering(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">検証・改ざんデモ</h2>

      {/* Verify Section */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">画像の真正性を検証</h3>
        <p className="text-xs text-gray-500 mb-3">
          画像ファイルを選択すると、ブロックチェーン上のハッシュと照合します。
        </p>

        <label className="block">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleVerifyFile}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
              file:text-sm file:font-semibold file:bg-gray-700 file:text-gray-300
              hover:file:bg-gray-600 file:cursor-pointer file:transition-colors"
          />
        </label>

        {isVerifying && (
          <div className="mt-3 text-sm text-gray-400 animate-pulse">検証中...</div>
        )}

        {verifyResult && (
          <div className={`mt-3 p-3 rounded-lg border ${
            verifyResult.status === "match"
              ? "bg-green-900/30 border-green-600"
              : "bg-red-900/30 border-red-600"
          }`}>
            {verifyResult.status === "match" ? (
              <div className="space-y-1">
                <div className="text-green-400 font-bold text-sm">
                  この画像はブロックチェーンに記録されています
                </div>
                {verifyResult.matchedTx && (
                  <div className="text-xs text-gray-400">
                    <div>記録日時: {formatDate(verifyResult.matchedTx.timestamp)}</div>
                    <a
                      href={`https://testnet.symbol.fyi/transactions/${verifyResult.matchedTx.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      トランザクションを確認
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-red-400 font-bold text-sm">
                  この画像はブロックチェーンに記録されていません
                </div>
                <div className="text-xs text-gray-500">
                  改ざんされた画像、または未登録の画像です。
                </div>
              </div>
            )}
            <div className="mt-2 text-xs font-mono text-gray-500 break-all">
              画像ハッシュ: {verifyResult.fileHash}
            </div>
          </div>
        )}
      </div>

      {/* Tamper Demo Section */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">改ざん検知デモ</h3>
        <p className="text-xs text-gray-500 mb-3">
          登録済み画像に改ざんを加え、ハッシュが完全に変わることを確認できます。
        </p>

        <button
          type="button"
          onClick={handleTamperDemo}
          disabled={isTampering}
          className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
            isTampering
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-gradient-to-r from-orange-600 to-red-600 hover:scale-105 active:scale-95 text-white shadow-lg shadow-orange-500/20"
          }`}
        >
          {isTampering ? "実行中..." : "改ざんデモを実行"}
        </button>

        {tamperError && (
          <div className="mt-3 text-sm text-red-400">{tamperError}</div>
        )}

        {tamperResult && (
          <div className="mt-4 space-y-3">
            {/* Visual comparison */}
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="text-xs text-green-400 font-semibold mb-1">オリジナル</div>
                <img
                  src={tamperResult.originalUrl}
                  alt="original"
                  className="w-full aspect-square object-cover rounded-lg border-2 border-green-600"
                />
              </div>
              <div className="text-center">
                <div className="text-xs text-red-400 font-semibold mb-1">改ざん画像</div>
                <img
                  src={tamperResult.tamperedUrl}
                  alt="tampered"
                  className="w-full aspect-square object-cover rounded-lg border-2 border-red-600"
                />
              </div>
            </div>

            {/* Hash comparison */}
            <div className="space-y-2 bg-gray-900 p-3 rounded-lg">
              <div>
                <div className="text-xs text-green-400 font-semibold">オリジナルのハッシュ:</div>
                <div className="text-xs font-mono text-gray-300 break-all">
                  {tamperResult.originalHash}
                </div>
              </div>
              <div>
                <div className="text-xs text-red-400 font-semibold">改ざん後のハッシュ:</div>
                <div className="text-xs font-mono text-gray-300 break-all">
                  {tamperResult.tamperedHash}
                </div>
              </div>
              <div className="text-xs text-yellow-400 font-bold pt-1 border-t border-gray-700">
                画像への改ざんでハッシュが完全に変化 → 改ざんは即検出可能
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
