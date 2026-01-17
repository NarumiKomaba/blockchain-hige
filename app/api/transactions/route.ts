import { NODE_URL } from "../../../utils/symbolConfig";

export async function PUT(request: Request) {
  const payload = await request.json();
  const response = await fetch(`${NODE_URL}/transactions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
