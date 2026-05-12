import { getTranslations } from "next-intl/server";

export default async function ReviewsPage() {
  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">{t("reviews")}</h1>
      <p className="text-sm text-muted-foreground">
        AI sentiment on Play reviews is on the roadmap. Track keywords and listings in the meantime.
      </p>
    </div>
  );
}
