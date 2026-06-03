import { AuthModalHost } from "@/components/auth/auth-modal-host";
import { AuthModalProvider } from "@/components/auth/auth-modal-context";
import { LocaleAttributes } from "@/components/layout/LocaleAttributes";
import { LocaleHtmlBootstrap } from "@/components/layout/locale-html-bootstrap";
import { routing } from "@/i18n/routing";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AuthModalProvider>
        <LocaleHtmlBootstrap locale={locale} />
        <LocaleAttributes />
        {children}
        <AuthModalHost />
      </AuthModalProvider>
    </NextIntlClientProvider>
  );
}
