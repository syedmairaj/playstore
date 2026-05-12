import { getTranslations } from "next-intl/server";

export default async function CompetitorsPage() {
  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">{t("competitorSpy")}</h1>
      <p className="text-sm text-muted-foreground">
        Gap finder and competitor matrix are shipping next — keyword and listing tools are live today.
      </p>
    </div>
  );
}
