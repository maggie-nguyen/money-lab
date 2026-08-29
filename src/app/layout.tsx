import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { env } from "@/server/config";
import { createT } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/requestLocale";

const serifDisplay = Source_Serif_4({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "600", "700"],
  variable: "--font-serif-display",
  display: "swap",
});

const bodySans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createT(locale);
  return {
    // Without this the canonical and Open Graph urls the article pages set stay
    // relative, and a crawler resolves them against whatever host it came in on.
    metadataBase: new URL(env().APP_ORIGIN),
    title: {
      default: "Money&Me",
      template: "%s · Money&Me",
    },
    description: t("landing.metaDescription"),
    applicationName: "Money&Me",
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#12160f" },
  ],
};

/**
 * Applies the saved theme before first paint so the page never flashes the
 * wrong ground. Kept inline and tiny on purpose.
 */
const THEME_BOOT = `try{var t=localStorage.getItem("ml-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${serifDisplay.variable} ${bodySans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-moss-600 focus:px-3 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
