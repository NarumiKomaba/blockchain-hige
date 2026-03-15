// app/api/proof/route.ts
import { NextResponse } from "next/server";
import { createProofPayload } from "@/lib/symbolProof";

export const runtime = "nodejs";

const NODE_URL =
  process.env.SYMBOL_NODE_URL || "https://sym-test-01.opening-line.jp:3001";

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

    const privateKey = process.env.SYMBOL_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { ok: false, error: "SYMBOL_PRIVATE_KEY is not configured" },
        { status: 500 }
      );
    }

    const { payload, recipientAddress: finalRecipientAddress } =
      createProofPayload(privateKey, messageContent, recipientAddress || undefined);

    // Symbol ノードへアナウンス
    try {
      const url = `${NODE_URL}/transactions`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      const text = await res.text();
      let bodyParsed: unknown = text;
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
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      return NextResponse.json(
        {
          ok: false,
          error: "fetch failed",
          message: error.message,
          nodeUrl: NODE_URL,
        },
        { status: 500 }
      );
    }
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
