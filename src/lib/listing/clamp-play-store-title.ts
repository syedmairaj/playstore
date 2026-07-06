export const PLAY_STORE_TITLE_MAX = 30;

/** Word-boundary clamp for Play Store titles (max 30 chars). */
export function clampPlayStoreTitle(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= PLAY_STORE_TITLE_MAX) return trimmed;

  const window = trimmed.slice(0, PLAY_STORE_TITLE_MAX);
  const minBreak = Math.floor(PLAY_STORE_TITLE_MAX * 0.45);
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace >= minBreak) {
    return window.slice(0, lastSpace).trimEnd();
  }

  const withoutTrailingPunct = window.replace(/[\s&\-:,/|]+$/g, "").trimEnd();
  if (withoutTrailingPunct.length >= minBreak) {
    return withoutTrailingPunct;
  }

  return `${trimmed.slice(0, PLAY_STORE_TITLE_MAX - 1)}…`;
}
