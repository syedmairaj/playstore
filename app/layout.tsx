import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://playstore.xyz"),
  title: {
    default: "PlayStore — Google Play ASO",
    template: "%s · PlayStore",
  },
  description:
    "Keywords, AI listings, and competitor gaps for Google Play — built for indie teams and MENA.",
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["ar_SA"],
    siteName: "PlayStore",
    title: "PlayStore — Google Play ASO",
    description:
      "Keywords, AI listings, and competitor gaps for Google Play — built for indie teams and MENA.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PlayStore",
    description: "Google Play ASO without the enterprise weight.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
