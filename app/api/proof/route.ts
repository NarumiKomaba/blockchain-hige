// app/api/proof/route.ts
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const NODE_URL = process.env.SYMBOL_NODE_URL || "https://sym-test-01.opening-line.jp:3001";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messageContent = (body?.messageContent || "").trim();
    const recipientAddress = (body?.recipientAddress || "").trim();

    if (!messageContent) {
      return NextResponse.json(
        { ok: false, error: "messageContent is required" },
        { status: 400 }
      );
    }

    // scripts/proof.cjs を実行して payload を生成
    let proofResult: { recipientAddress: string; payload: string };
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["scripts/proof.cjs", messageContent, recipientAddress],
        { env: { ...process.env }, encoding: "utf8" }
      );
      proofResult = JSON.parse(stdout);
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          error: "proof generation failed",
          details: {
            message: e?.message,
            stdout: e?.stdout,
            stderr: e?.stderr,
          },
        },
        { status: 500 }
      );
    }

    const { payload, recipientAddress: finalRecipientAddress } = proofResult;

    // Symbol ノードへアナウンス（詳細エラーも返す）
    try {
      const url = `${NODE_URL}/transactions`;
      console.log("[/api/proof] announce url =", url);

      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      const text = await res.text();

      let bodyParsed: any = text;
      try {
        bodyParsed = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "announce failed",
            nodeUrl: NODE_URL,
            details: { status: res.status, body: bodyParsed },
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        nodeUrl: NODE_URL,
        recipientAddress: finalRecipientAddress,
        announced: bodyParsed,
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          error: "fetch failed",
          message: e?.message,
          name: e?.name,
          cause: e?.cause
            ? { message: e.cause.message, code: e.cause.code }
            : undefined,
          nodeUrl: NODE_URL,
        },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error("[/api/proof] ERROR:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) ?? "Unknown error" },
      { status: 500 }
    );
  }
}
