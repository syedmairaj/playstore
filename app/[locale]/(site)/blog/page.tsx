import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p className="text-sm font-medium text-primary">{t("blog")}</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">Coming soon</h1>
      <p className="mt-4 text-muted-foreground">
        Play-first ASO guides, MENA launch notes, and product updates.
      </p>
      <Link href="/" className="mt-8 inline-block text-sm font-medium text-primary hover:underline">
        ← Home
      </Link>
    </div>
  );
}
