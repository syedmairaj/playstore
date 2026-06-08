"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthModalTrigger } from "@/components/auth/auth-modal-trigger";
import { PlayStoreLogo } from "@/components/marketing/PlayStoreLogo";
import { cn } from "@/lib/utils";

const linkClass =
  "text-sm font-medium text-white/55 transition-colors duration-200 hover:text-[#22C55E]";

const headingClass =
  "text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38";

export function SiteFooter() {
  const t = useTranslations("footer");
  const tn = useTranslations("nav");
  const year = new Date().getFullYear();

  const product: { href?: string; label: string; auth?: boolean }[] = [
    { href: "/features", label: tn("features") },
    { href: "/pricing", label: tn("pricing") },
    { href: "/blog", label: tn("blog") },
    { label: tn("startTrial"), auth: true },
  ];

  const legal = [
    { href: "/privacy", label: t("privacy") },
    { href: "/terms", label: t("terms") },
  ];

  return (
    <footer className="relative border-t border-white/[0.07] bg-gradient-to-b from-[#0B0E14] via-[#080a0f] to-black/80">
      {/* Reserve horizontal space so copy rarely sits under the fixed Live demo (end side). */}
      <div
        className={cn(
          "mx-auto max-w-7xl px-4 pb-24 pt-14 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8",
          "pe-[max(1rem,calc(1.25rem+9rem))] lg:pe-[max(2rem,calc(1.25rem+10rem))]",
        )}
      >
        <div className="grid gap-14 sm:gap-12 lg:grid-cols-12 lg:items-start lg:gap-10">
          {/* Brand */}
          <div className="lg:col-span-5">
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-2 rounded-lg outline-none ring-offset-[#0B0E14] transition-opacity duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#22C55E]/60"
            >
              <PlayStoreLogo size="sm" brand="play" />
            </Link>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/52 sm:text-sm">
              {t("tagline")}
            </p>
          </div>

          {/* Link columns */}
          <nav
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:col-span-7 lg:justify-end"
            aria-label={t("navAria")}
          >
            <div>
              <h2 className={headingClass}>{t("product")}</h2>
              <ul className="mt-5 space-y-3">
                {product.map((item) => (
                  <li key={item.href ?? "start-trial"}>
                    {item.auth ? (
                      <AuthModalTrigger
                        intent="signup"
                        mode="link"
                        label={item.label}
                        className={linkClass}
                      />
                    ) : (
                      <Link href={item.href!} className={linkClass}>
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className={headingClass}>{t("legal")}</h2>
              <ul className="mt-5 space-y-3">
                {legal.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={linkClass}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <h2 className={headingClass}>{t("company")}</h2>
              <ul className="mt-5 space-y-3">
                <li>
                  <a
                    href="mailto:hello@playstore.xyz"
                    className="text-sm font-medium text-white/55 transition-colors duration-200 hover:text-[#4285F4]"
                  >
                    {t("contact")}
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </div>

      {/* Disclaimer + copyright — visually separated, calmer type */}
      <div className="border-t border-white/[0.06] bg-black/25">
        <div className="mx-auto max-w-3xl px-4 py-10 text-center sm:px-6 sm:py-12">
          <p className="text-[11px] leading-relaxed text-white/48 sm:text-xs sm:leading-relaxed">
            {t("disclaimer")}
          </p>
          <p className="mt-8 text-[11px] text-white/32 sm:mt-9">
            © {year} PlayStore · {t("rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
