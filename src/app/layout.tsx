import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Kyeruu OCR - Finance", description: "Financial documents, reconciliation, and audit verification." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Writing extensions can add attributes to body before React hydrates.
  // Limit suppression to this element; keep checks enabled for page content.
  return <html lang="en"><body suppressHydrationWarning className="min-h-screen bg-gray-50 text-gray-900">{children}</body></html>;
}
