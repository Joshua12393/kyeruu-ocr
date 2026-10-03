import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { getAuthenticatedUser } from "@/lib/auth";
import Navigation from "./navigation";
import "./globals.css";
export const metadata: Metadata = { title: "Kyeruu OCR - Finance", description: "Financial documents, reconciliation, and audit verification." };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/api/auth/signin?callbackUrl=%2F");
  const officer = await getAuthenticatedUser();
  // Writing extensions can add attributes to body before React hydrates.
  // Limit suppression to this element; keep checks enabled for page content.
  return <html lang="en"><body suppressHydrationWarning className="min-h-screen bg-gray-50 text-gray-900"><Navigation />
    {officer ? children : <main className="max-w-xl mx-auto p-8"><h1 className="text-2xl font-bold">Finance access unavailable</h1><p>Your account needs an eligible officer assignment for the active term. Contact the person who manages officer accounts.</p></main>}
  </body></html>;
}
