/** Shared with `SerperPreviewResults` and Keyword Tracker preview persistence. */
export type SerperPreviewItem = {
  title: string;
  link: string;
  packageId: string | null;
  position: number;
  snippet: string | null;
};

export type SerperPreviewCountry = {
  country: string;
  gl: string;
  hl: string;
  items: SerperPreviewItem[];
  error: string | null;
};
