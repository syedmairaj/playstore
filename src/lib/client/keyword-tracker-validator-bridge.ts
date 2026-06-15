"use client";

import { useEffect, useState } from "react";
import type { SupportedCountryCode } from "@/lib/countries";

export const KEYWORD_TRACKER_VALIDATOR_BRIDGE_EVENT =
  "playstore:keyword-tracker-validator-bridge" as const;

export type KeywordTrackerValidatorBridgeState = {
  selectedCountries: SupportedCountryCode[];
  scopeAppId?: string;
};

export function publishKeywordTrackerValidatorBridge(
  state: KeywordTrackerValidatorBridgeState,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(KEYWORD_TRACKER_VALIDATOR_BRIDGE_EVENT, { detail: state }),
  );
}

export function useKeywordTrackerValidatorBridge(
  fallbackCountries: SupportedCountryCode[],
): KeywordTrackerValidatorBridgeState {
  const [state, setState] = useState<KeywordTrackerValidatorBridgeState>({
    selectedCountries: fallbackCountries,
  });

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<KeywordTrackerValidatorBridgeState>).detail;
      if (!detail?.selectedCountries?.length) return;
      setState(detail);
    };
    window.addEventListener(KEYWORD_TRACKER_VALIDATOR_BRIDGE_EVENT, handler);
    return () =>
      window.removeEventListener(KEYWORD_TRACKER_VALIDATOR_BRIDGE_EVENT, handler);
  }, []);

  return state;
}
