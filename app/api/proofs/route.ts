// app/api/proofs/route.ts
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const NODE_URL =
  process.env.SYMBOL_NODE_URL || "https://sym-test-01.opening-line.jp:3001";

// hex文字列 -> UTF-8 文字列（Symbolのmessage.payloadは16進になることが多い）
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

async function getDefaultAddressFromEnvPK(): Promise<string> {
  // scripts/proof.cjs は payload 生成のついでに recipientAddress を返せるので、それを流用
  // messageContent はダミーでOK（payloadは使わない）
  const { stdout } = await execFileAsync(process.execPath, ["scripts/proof.cjs", "dummy"], {
    env: { ...process.env },
  });
  const json = JSON.parse(stdout);
  return json.recipientAddress as string;
}

/**
 * tx.message の候補をできるだけ拾って messageHex/messageText を埋める
 * ノードやSDKのバージョン差で形が違うケースに備える
 */
function extractMessagePayloadHex(tx: any): string {
  if (!tx) return "";

  // 最も典型：tx.message.payload
  const a = tx?.message?.payload;
  if (typeof a === "string" && a.length > 0) return a;

  // 稀：tx.message が配列（アグリゲート等）
  const b = tx?.message?.[0]?.payload;
  if (typeof b === "string" && b.length > 0) return b;

  // 稀：tx.message が文字列で直接入る
  const c = tx?.message;
  if (typeof c === "string" && c.length > 0) return c;

  // それ以外は空
  return "";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const addressParam = (searchParams.get("address") || "").trim();

    const address = addressParam || (await getDefaultAddressFromEnvPK());
    const cleanAddress = address.replace(/-/g, "");

    // transfer tx type = 16724 (0x4154)
    const url = `${NODE_URL}/transactions/confirmed?address=${cleanAddress}&order=desc&type=16724&pageSize=50`;

    const res = await fetch(url, { cache: "no-store" });

    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {}

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "node fetch failed", nodeUrl: NODE_URL, url, status: res.status, details: body },
        { status: 500 }
      );
    }

    const data = body?.data || [];
    const items = data.map((item: any) => {
      const tx = item?.transaction || {};
      const meta = item?.meta || {};

      // message payload をなるべく拾う
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
    });

    // ✅ デバッグ用：messageが空のときに “tx.message の生データ” を少しだけ返す
    // 返しすぎると重いので、先頭5件だけ・必要最小限
    const debugTop = (data || []).slice(0, 5).map((item: any) => {
      const tx = item?.transaction || {};
      const meta = item?.meta || {};
      return {
        hash: meta?.hash,
        height: meta?.height,
        // tx.message の形がどうなってるかを見る
        messageRaw: tx?.message ?? null,
        // 取得関数が拾ったpayload
        payloadPicked: extractMessagePayloadHex(tx),
      };
    });

    return NextResponse.json({
      ok: true,
      nodeUrl: NODE_URL,
      url,
      address,
      count: items.length,
      items,
      debug: {
        top5: debugTop,
        hint:
          "messageHex/messageText が空の場合は debug.top5[].messageRaw を見て、messageの構造が想定と違っていないか確認してください。",
      },
    });
  } catch (e: any) {
    console.error("[/api/proofs] ERROR:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) ?? "Unknown error" },
      { status: 500 }
    );
  }
}
