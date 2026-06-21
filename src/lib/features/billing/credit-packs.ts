/**
 * One-time credit packs — separate from recurring Pro/Growth subscriptions.
 */
export type CreditPackId = "pro_power" | "standard_100" | "pack_250" | "pack_500" | "pack_1000";

export type CreditPackDefinition = {
  id: CreditPackId;
  name: string;
  credits: number;
  priceUsd: number;
  /** One-time Stripe Checkout — never creates or modifies a subscription. */
  mode: "payment";
  badge?: "featured";
};

export const PRO_POWER_PACK: CreditPackDefinition = {
  id: "pro_power",
  name: "Pro-Power Pack",
  credits: 50,
  priceUsd: 9,
  mode: "payment",
  badge: "featured",
};

export const CREDIT_PACK_CATALOG: Record<CreditPackId, CreditPackDefinition> = {
  pro_power: PRO_POWER_PACK,
  standard_100: {
    id: "standard_100",
    name: "100 Credit Pack",
    credits: 100,
    priceUsd: 12,
    mode: "payment",
  },
  pack_250: {
    id: "pack_250",
    name: "250 Credit Pack",
    credits: 250,
    priceUsd: 24,
    mode: "payment",
  },
  pack_500: {
    id: "pack_500",
    name: "500 Credit Pack",
    credits: 500,
    priceUsd: 45,
    mode: "payment",
  },
  pack_1000: {
    id: "pack_1000",
    name: "1000 Credit Pack",
    credits: 1000,
    priceUsd: 75,
    mode: "payment",
  },
};

export function resolveCreditPack(packId: string): CreditPackDefinition | null {
  return CREDIT_PACK_CATALOG[packId as CreditPackId] ?? null;
}
