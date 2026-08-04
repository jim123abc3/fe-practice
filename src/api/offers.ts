export interface OfferInput {
  itemId: string;
  amountCents: number;
}

export interface OfferResponse {
  itemId: string;
  amountCents: number;
  accepted: boolean;
}

export async function postOffer(input: OfferInput): Promise<OfferResponse> {
  const res = await fetch("/api/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `postOffer failed: ${res.status}`);
  }
  return res.json();
}
