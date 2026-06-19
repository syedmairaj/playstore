export type CreditGenerationType = "text" | "media";

export type CreditLedgerMeta = Record<string, unknown> & {
  generation_type: CreditGenerationType;
};

/** Standard ledger meta — associates spend with text vs media generation. */
export function buildCreditLedgerMeta(
  generationType: CreditGenerationType,
  extra?: Record<string, unknown>,
): CreditLedgerMeta {
  return {
    generation_type: generationType,
    ...extra,
  };
}
