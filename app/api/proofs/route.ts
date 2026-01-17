// app/api/proofs/route.ts
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const NODE_URL = process.env.SYMBOL_NODE_URL || "https://sym-test-01.opening-line.jp:3001";

// hex文字列 -> UTF-8 文字列（Symbolのmessage.payloadは16進になることが多い）
function hexToUtf8(hex: string): string {
  if (!hex) return "";
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  const tryDecode = (value: string) => {
    if (!value || value.length % 2 !== 0) return "";
    const bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < value.length; i += 2) {
      bytes[i / 2] = parseInt(value.substring(i, i + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  };

  const decoded = tryDecode(cleaned);
  if (decoded) return decoded;
  if (cleaned.startsWith("00")) {
    return tryDecode(cleaned.slice(2));
  }
  return "";
}

async function getDefaultAddressFromEnvPK(): Promise<string> {
  // scripts/proof.cjs は payload 生成のついでに recipientAddress を返せるので、それを流用
  // messageContent はダミーでOK（payloadは使わない）
  const { stdout } = await execFileAsync(process.execPath, ["scripts/proof.cjs", "dummy"], {
    env: { ...process.env },
  });
  const json = JSON.parse(stdout);
  return json.recipientAddress as string;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const addressParam = (searchParams.get("address") || "").trim();

    const address = addressParam || (await getDefaultAddressFromEnvPK());
    const cleanAddress = address.replace(/-/g, "");

    // transfer tx type = 16724 (0x4154)
    const url = `${NODE_URL}/transactions/confirmed?address=${cleanAddress}&order=desc&type=16724&pageSize=20`;
    const res = await fetch(url);

    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {}

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "node fetch failed", nodeUrl: NODE_URL, details: body },
        { status: 500 }
      );
    }

    const data = body?.data || [];
    const items = data.map((item: any) => {
      const tx = item?.transaction || {};
      const meta = item?.meta || {};

      // message payload は hex のことが多い（plain message）
      const payloadHex = tx?.message?.payload || "";
      const decodedMessage = hexToUtf8(payloadHex);

      return {
        hash: meta?.hash,
        height: meta?.height,
        timestamp: meta?.timestamp,
        recipientAddress: tx?.recipientAddress,
        messageHex: payloadHex,
        messageText: decodedMessage,
      };
    });

    return NextResponse.json({
      ok: true,
      nodeUrl: NODE_URL,
      address,
      items,
    });
  } catch (e: any) {
    console.error("[/api/proofs] ERROR:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) ?? "Unknown error" },
      { status: 500 }
    );
  }
}
