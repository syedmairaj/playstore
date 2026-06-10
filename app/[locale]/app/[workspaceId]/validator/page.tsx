/**
 * DEPRECATED — this standalone Keyword Validator page has been removed.
 * The validator now lives as a contextual slide-over on the Keyword Tracker screen.
 * This file is kept only to satisfy the file system; it immediately redirects.
 */
import { redirect } from "next/navigation";

export default async function ValidatorPageRedirect({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  redirect(`/${locale}/app/${workspaceId}/keywords`);
}
