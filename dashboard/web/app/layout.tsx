import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fira_Code, Fira_Sans } from "next/font/google";
import "./globals.css";

const sans = Fira_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-fira-sans" });
const mono = Fira_Code({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-fira-code" });

export const metadata: Metadata = {
  title: "Opportunity Radar · Demand Workbench",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#020617" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-slate-950 font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
