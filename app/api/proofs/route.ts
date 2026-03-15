// app/api/proofs/route.ts
import { NextResponse } from "next/server";
import { getAddressFromPrivateKey } from "@/lib/symbolProof";

export const runtime = "nodejs";

const NODE_URL =
  process.env.SYMBOL_NODE_URL || "https://sym-test-01.opening-line.jp:3001";

function hexToUtf8(hex: string): string {
  if (!hex) return "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) return "";
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function extractMessagePayloadHex(tx: Record<string, unknown>): string {
  if (!tx) return "";

  const msg = tx?.message as Record<string, unknown> | string | undefined;

  if (typeof msg === "object" && msg !== null) {
    const payload = (msg as Record<string, unknown>).payload;
    if (typeof payload === "string" && payload.length > 0) return payload;
  }

  if (typeof msg === "string" && msg.length > 0) return msg;

  return "";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const addressParam = (searchParams.get("address") || "").trim();

    let address = addressParam;
    if (!address) {
      const privateKey = process.env.SYMBOL_PRIVATE_KEY;
      if (!privateKey) {
        return NextResponse.json(
          { ok: false, error: "SYMBOL_PRIVATE_KEY is not configured and no address provided" },
          { status: 500 }
        );
      }
      address = getAddressFromPrivateKey(privateKey);
    }
    const cleanAddress = address.replace(/-/g, "");

    const url = `${NODE_URL}/transactions/confirmed?address=${cleanAddress}&order=desc&type=16724&pageSize=50`;
    const res = await fetch(url, { cache: "no-store" });

    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text);
    } catch {}

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "node fetch failed", nodeUrl: NODE_URL, url, status: res.status, details: body },
        { status: 500 }
      );
    }

    const data = (body?.data || []) as Record<string, unknown>[];
    const SHA256_REGEX = /^[0-9a-f]{64}$/i;

    const items = data
      .map((item) => {
        const tx = (item?.transaction || {}) as Record<string, unknown>;
        const meta = (item?.meta || {}) as Record<string, unknown>;

        const payloadHex = extractMessagePayloadHex(tx);
        const decodedMessage = hexToUtf8(payloadHex);

        return {
          hash: meta?.hash,
          height: meta?.height,
          timestamp: meta?.timestamp,
          recipientAddress: tx?.recipientAddress,
          messageHex: payloadHex || "",
          messageText: decodedMessage || "",
        };
      })
      .filter((item) => SHA256_REGEX.test(item.messageText));

    return NextResponse.json({
      ok: true,
      nodeUrl: NODE_URL,
      url,
      address,
      count: items.length,
      items,
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
