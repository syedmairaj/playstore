import { redirect } from "next/navigation";

/**
 * /screenshot-studio is now part of Brand Assets.
 * Redirect to brand-assets with the screenshot tab pre-selected.
 */
export default async function ScreenshotStudioRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  redirect(`/${locale}/app/${workspaceId}/brand-assets?tab=screenshot`);
}
