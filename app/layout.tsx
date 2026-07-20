/**
 * app/layout.tsx
 * -----------------------------------------------------------------------------
 * Root layout for the construction multitool web app. Tool #1 (AI Architectural
 * Plan Analyzer & Redrawer) is mounted at the root route in app/page.tsx.
 * -----------------------------------------------------------------------------
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AI Plan Analyzer & Redrawer | Construction Multitool",
  description:
    "Upload a blueprint, hand sketch, or architectural drawing to get an AI-powered layout analysis, clean redrawn vector plan, space-planning review, furniture suggestions, and material cost estimate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}
