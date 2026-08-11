import type { Metadata } from "next";
import "./globals.css";
import { DemoStoreProvider } from "@/components/demo-store-provider";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://arvanta-procurebridge-recovery.valentansuri123.chatgpt.site"),
  title: { default: "Arvanta Distributor Mini ERP", template: "%s | Arvanta Distributor ERP" },
  description: "A Demo Data distributor ERP connecting purchasing, inventory, sales, finance, and an approval-gated mock Supplier Agent.",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Arvanta Distributor Mini ERP",
    description: "A focused distributor workflow with atomic ERP commands and a human-controlled Supplier Agent. Demo Data.",
    url: "/",
    siteName: "Arvanta Distributor ERP",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Arvanta Distributor Mini ERP — Demo Data" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arvanta Distributor Mini ERP",
    description: "Purchasing, stock, sales, and finance with a human-controlled mock Supplier Agent. Demo Data.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DemoStoreProvider><AppShell>{children}</AppShell></DemoStoreProvider></body></html>;
}
