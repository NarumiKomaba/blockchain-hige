import { NODE_URL } from "../../../../utils/symbolConfig";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const order = searchParams.get("order") ?? "desc";
  const type = searchParams.get("type") ?? "16724";

  if (!address) {
    return new Response(JSON.stringify({ message: "address is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = `${NODE_URL}/transactions/confirmed?address=${encodeURIComponent(
    address
  )}&order=${encodeURIComponent(order)}&type=${encodeURIComponent(type)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upstream fetch failed";
    return new Response(JSON.stringify({ message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
