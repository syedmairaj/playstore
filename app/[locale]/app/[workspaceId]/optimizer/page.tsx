import { redirect } from "next/navigation";

/** Legacy path — canonical route is `/listing-optimizer`. */
export default async function WorkspaceOptimizerRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  redirect(`/${locale}/app/${workspaceId}/listing-optimizer`);
}
