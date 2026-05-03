import type { Metadata } from "next";
import { Geist, Noto_Serif_JP, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { CiteDrawerProvider } from "@/components/ui/cite-drawer";
import { CustomCursor } from "@/components/ui/custom-cursor";
import { ProgressRail } from "@/components/ui/progress-rail";
import { Preloader } from "@/components/ui/preloader";
import { TopBar } from "@/components/ui/topbar";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PaperRail } from "@/components/canvas/paper-rail";
import { LenisProvider } from "@/components/providers/lenis-provider";
import "./globals.css";

// Geist — Vercel's open-source sans, contemporary editorial face designed
// for product/marketing surfaces. Variable weights 100-900 (we use 300-700)
// give us one family that does both display and body without italics, with
// strong stylistic features ("ss01", "ss02", "calt") that read crisply at
// hero scale and at running-text size. We pair Geist with JetBrains Mono
// for code/UI lockups and Noto Serif JP for Japanese text.
const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-display-loaded",
  display: "swap",
});

const geistBody = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body-loaded",
  display: "swap",
});

const notoJP = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jp-loaded",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://yuholens.site"),
  title: {
    default: "YuhoLens — Read every yūhō. Cite every claim.",
    template: "%s · YuhoLens",
  },
  description:
    "A reading lens for the 88,000 pages of yūhō filed each year — span-cited, refused when uncertain. KG-2 coherence 3.88. Built on a single MI300X.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "YuhoLens — Read every yūhō. Cite every claim.",
    description:
      "Span-cited English memos from Japanese annual reports. KG-2 PASS at 3.88 coherence, 1.000 citation rate. Open weights, MIT.",
    url: "https://yuholens.site",
    siteName: "YuhoLens",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "YuhoLens" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "YuhoLens",
    images: ["/og.png"],
  },
};

// Authors can hand-share per-section OG cards via /og/{hero,kg2,demo,manifest}.
// These dynamic routes are statically rendered at build time (see app/og/[section]/route.tsx).
const SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "YuhoLens",
  applicationCategory: "FinancialApplication",
  applicationSubCategory: "Financial Document Analysis",
  license: "https://opensource.org/licenses/MIT",
  url: "https://yuholens.site",
  codeRepository: "https://github.com/javierdejesusda/YuhoLens",
  author: {
    "@type": "Organization",
    name: "YuhoLens",
    url: "https://github.com/javierdejesusda/YuhoLens",
  },
  datePublished: "2026-05-09",
  screenshot: "https://yuholens.site/og.png",
  softwareVersion: "v2.5",
  operatingSystem: "Linux (ROCm 7.0)",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

const THEME_INIT = `(function(){try{var t=localStorage.getItem('yuho-theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning on <html> and <body> only: browser extensions
    // (e.g. VS Code Live Server, dark-reader) inject classes after SSR which
    // otherwise trip React's hydration mismatch warning.
    <html
      lang="en"
      className={`${geist.variable} ${geistBody.variable} ${notoJP.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <a className="skip-to-main" href="#main-content">
          Skip to main
        </a>
        <Preloader />
        <ScrollProgress />
        <TopBar />
        <ThemeToggle />
        <PaperRail />
        <LenisProvider>
          <CiteDrawerProvider>{children}</CiteDrawerProvider>
        </LenisProvider>
        <CustomCursor />
        <ProgressRail />
        <Script
          id="ld-json"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify(SCHEMA)}
        </Script>
      </body>
    </html>
  );
}
