import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { fileUrl } from "@/lib/storage-url";
import { getBranding, getSiteInfo } from "@/lib/site-content";

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
  const [{ logos }, { store }] = await Promise.all([getBranding(), getSiteInfo()]);
  const url = (a: { key: string } | null) => (a ? (fileUrl(a.key) ?? undefined) : undefined);
  const og = logos.og;
  const description =
    store.about ||
    "Phone stands, keychains, clickers and more: browse in 3D, make it yours, and we print it. Designed and printed in the Philippines.";
  return {
    metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
    title: {
      default: store.tagline ? `${store.name} — ${store.tagline}` : store.name,
      template: `%s · ${store.name}`,
    },
    description,
    applicationName: store.name,
    icons: {
      icon: url(logos.favicon) ?? "/brand/icon.png",
      apple: url(logos.appleIcon) ?? url(logos.favicon) ?? "/brand/apple-icon.png",
    },
    openGraph: {
      type: "website",
      siteName: store.name,
      title: store.name,
      description,
      ...(og ? { images: [{ url: url(og)!, width: og.width, height: og.height, alt: store.name }] } : {}),
    },
    twitter: {
      card: og ? "summary_large_image" : "summary",
      title: store.name,
      description,
      ...(og ? { images: [url(og)!] } : {}),
    },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
