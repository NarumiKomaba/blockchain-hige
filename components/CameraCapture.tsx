"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraState = "idle" | "requesting" | "active" | "error";

type CameraCaptureProps = {
  readonly onCapture: (blob: Blob) => void;
  readonly previewUrl: string;
};

function getCameraErrorMessage(error: DOMException): string {
  switch (error.name) {
    case "NotAllowedError":
      return "カメラのアクセスが拒否されました。ブラウザの設定を確認してください。";
    case "NotFoundError":
      return "カメラが見つかりません。";
    case "NotReadableError":
      return "カメラが他のアプリで使用中です。";
    default:
      return "カメラの起動に失敗しました: " + error.message;
  }
}

export function CameraCapture({ onCapture, previewUrl }: CameraCaptureProps) {
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState("idle");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Attach stream to video element when state becomes active
  // (the video element mounts fresh, so srcObject needs to be re-set)
  useEffect(() => {
    if (cameraState === "active" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraState]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("このブラウザはカメラに対応していません。");
      setCameraState("error");
      return;
    }

    setCameraState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraState("active");
    } catch (error) {
      const message =
        error instanceof DOMException
          ? getCameraErrorMessage(error)
          : "カメラの起動に失敗しました";
      setErrorMessage(message);
      setCameraState("error");
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopCamera();
          onCapture(blob);
        }
      },
      "image/jpeg",
      0.85
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isActive = cameraState === "active";

  return (
    <div className="text-center space-y-4">
      {/* Idle state: show preview + camera/upload buttons */}
      {cameraState === "idle" && (
        <div className="space-y-3">
          {previewUrl && (
            <div className="inline-flex items-center justify-center w-32 h-32 rounded-full overflow-hidden">
              <img
                src={previewUrl}
                alt="preview"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={startCamera}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-500 hover:border-blue-400 transition-all text-sm text-gray-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              撮影
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-500 hover:border-purple-400 transition-all text-sm text-gray-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              アップロード
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Requesting state: loading */}
      {cameraState === "requesting" && (
        <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gray-700 border-2 border-blue-400">
          <span className="text-gray-400 text-sm animate-pulse">
            カメラ起動中...
          </span>
        </div>
      )}

      {/* Active state: live video feed + shutter button */}
      {isActive && (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-64 object-cover"
            />
          </div>
          <div className="flex justify-center gap-4">
            <button
              type="button"
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 hover:border-blue-400 active:scale-90 transition-all shadow-lg"
              aria-label="撮影"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-white hover:bg-gray-100 transition-colors" />
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="self-center text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {cameraState === "error" && (
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gray-700 border-2 border-red-500">
            <span className="text-red-400 text-xs px-3 text-center">
              {errorMessage}
            </span>
          </div>
          <div>
            <button
              type="button"
              onClick={startCamera}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              再試行
            </button>
          </div>
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
