import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DemoStoreProvider } from "@/components/demo-store-provider";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "Arvanta ProcureBridge Recovery Agent", template: "%s | ProcureBridge" },
  description: "Human-approved AI voice recovery workflow powered by CALL-E.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Arvanta ProcureBridge Recovery Agent",
    description: "Invoice overdue → Human approval → CALL-E → Structured recovery",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Arvanta ProcureBridge Recovery Agent workflow" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DemoStoreProvider><AppShell>{children}</AppShell></DemoStoreProvider>
      </body>
    </html>
  );
}
