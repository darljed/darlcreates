import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { fileUrl } from "@/lib/storage-url";
import { getBranding, getSiteInfo } from "@/lib/site-content";
import { PwaRegister } from "@/components/pwa-register";
import { ConfirmProvider } from "@/components/confirm-provider";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

/** Title, favicon, home-screen icon and link-sharing image come from Admin → Logos & branding / Store & footer. */
export async function generateMetadata(): Promise<Metadata> {
  const [{ logos }, { store, seo }] = await Promise.all([getBranding(), getSiteInfo()]);
  const url = (a: { key: string } | null) => (a ? (fileUrl(a.key) ?? undefined) : undefined);
  // Admin-uploaded image wins; otherwise the bundled public/og-card.png (1200x630).
  const og = logos.og ?? null;
  const ogImage = og
    ? { url: url(og)!, width: og.width, height: og.height }
    : { url: "/og-card.png", width: 1200, height: 630 };
  const title = seo.title;
  const description = seo.description;
  return {
    metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
    title: { default: title, template: `%s · ${store.name}` },
    description,
    applicationName: store.name,
    appleWebApp: { capable: true, title: store.name, statusBarStyle: "default" },
    formatDetection: { telephone: false },
    icons: {
      icon: url(logos.favicon) ?? "/brand/icon.png",
      apple: url(logos.appleIcon) ?? url(logos.favicon) ?? "/brand/apple-icon.png",
    },
    openGraph: {
      type: "website",
      siteName: store.name,
      locale: "en_PH",
      title,
      description,
      images: [{ ...ogImage, alt: store.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url],
    },
  };
}

/** Browser/phone chrome colour: the brand primary (also the PWA theme colour in manifest.ts). */
export const viewport: Viewport = { themeColor: "#0077a5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ConfirmProvider>{children}</ConfirmProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
