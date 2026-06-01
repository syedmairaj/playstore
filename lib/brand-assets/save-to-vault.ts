"use client";

/**
 * saveGeneratedAssetsToVault
 *
 * After Runware returns image URLs, fetches each blob and uploads it
 * to Supabase Storage via a server-signed upload URL, then records
 * the metadata row in brand_assets.
 *
 * Runs fire-and-forget (non-blocking) — generation results are shown
 * immediately; vault save happens in the background.
 */

export type SaveAssetInput = {
  workspaceId: string;
  appId: string;
  assetType: "icon" | "banner";
  imageUrls: string[];           // HTTPS URLs from Runware
  meta?: Record<string, unknown>; // style, brandColor, etc.
};

type UploadUrlResponse = {
  ok: true;
  assetId: string;
  storagePath: string;
  uploadUrl: string;
  token: string;
} | { ok: false; error: { message: string } };

async function fetchImageBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" });
    if (!res.ok) return null;
    return await res.blob();
  } catch { return null; }
}

export async function saveGeneratedAssetsToVault(input: SaveAssetInput): Promise<void> {
  const { workspaceId, appId, assetType, imageUrls, meta } = input;

  await Promise.allSettled(
    imageUrls.map(async (url, i) => {
      // 1. Fetch the image blob from Runware CDN
      const blob = await fetchImageBlob(url);
      if (!blob) return;

      const mimeType = (blob.type === "image/jpeg" || blob.type === "image/webp")
        ? blob.type as "image/jpeg" | "image/webp"
        : "image/png";
      const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
      const fileName = `${assetType}-${appId.slice(0, 8)}-v${i + 1}.${ext}`;

      // 2. Request a signed upload URL + create the metadata row
      const res = await fetch("/api/brand-assets/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          appId,
          assetType,
          fileName,
          mimeType,
          sizeBytes: blob.size,
          variantIndex: i,
          meta: { ...meta, sourceUrl: url },
        }),
      });

      const json = (await res.json()) as UploadUrlResponse;
      if (!json.ok) return;

      // 3. Upload directly to Supabase Storage via signed URL
      await fetch(json.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: blob,
      });
    }),
  );
}
