import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fafafa",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://walkandsubway.com"),
  title: "walkmaxxing",
  description: "NYC transit routing where you pick the walking/transfer tradeoff",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "walkmaxxing",
  },
  openGraph: {
    title: "walkmaxxing",
    description: "NYC transit routing where you pick the walking/transfer tradeoff",
    url: "https://walkandsubway.com",
    siteName: "walkmaxxing",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "walkmaxxing — slide right to trade subway transfers for more walking" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "walkmaxxing",
    description: "NYC transit routing where you pick the walking/transfer tradeoff",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
