import type { Metadata } from "next";
import "./globals.css";
import { DemoStoreProvider } from "@/components/demo-store-provider";
import { JudgeDemoProvider } from "@/components/judge-demo-provider";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://arvanta-procurebridge-recovery.valentansuri123.chatgpt.site"),
  title: { default: "Arvanta ProcureBridge Recovery Agent", template: "%s | ProcureBridge" },
  description: "AI-powered receivables collection with CALL-E, structured outcomes, human approval, and auditable recovery actions.",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Arvanta ProcureBridge Recovery Agent",
    description: "AI-powered receivables collection: CALL-E conversations become human-approved promise, dispute, and follow-up actions. Demo Data.",
    url: "/",
    siteName: "Arvanta ProcureBridge",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Arvanta ProcureBridge Recovery Agent — AI-powered receivables collection — Demo Data" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arvanta ProcureBridge Recovery Agent",
    description: "AI-powered receivables collection with human control. Demo Data.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <DemoStoreProvider>
          <JudgeDemoProvider><AppShell>{children}</AppShell></JudgeDemoProvider>
        </DemoStoreProvider>
      </body>
    </html>
  );
}
