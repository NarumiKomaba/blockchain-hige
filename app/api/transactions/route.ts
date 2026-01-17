import { NODE_URL } from "../../../utils/symbolConfig";

export async function PUT(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let response: Response;
  try {
    response = await fetch(`${NODE_URL}/transactions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
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
