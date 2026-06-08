/** Sets <html lang/dir> before hydration (pairs with LocaleAttributes on the client). */
export function LocaleHtmlBootstrap({ locale }: { locale: string }) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const isAr = locale === "ar";
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.lang=${JSON.stringify(locale)};document.documentElement.dir=${JSON.stringify(dir)};document.documentElement.classList.toggle("locale-ar",${isAr});`,
      }}
    />
  );
}
