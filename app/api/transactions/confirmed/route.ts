import { NODE_URL } from "../../../../utils/symbolConfig";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const order = searchParams.get("order") ?? "desc";
  const type = searchParams.get("type") ?? "16724";

  const url = `${NODE_URL}/transactions/confirmed?address=${address}&order=${order}&type=${type}`;
  const response = await fetch(url);

  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
