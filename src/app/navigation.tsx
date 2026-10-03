"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
export default function Navigation() {
  return <nav className="flex flex-wrap items-center gap-4 p-4 border-b text-sm">
    <Link href="/">Finance home</Link><Link href="/schedules">Schedules</Link>
    <Link href="/transactions/vouchers">Vouchers</Link><Link href="/transactions/receipts">Acknowledgement receipts</Link>
    <Link href="/ocr">OCR</Link><Link href="/supporting">Supporting documents</Link>
    <Link href="/reconciliation">Reconciliation</Link><Link href="/verification">Verification</Link><Link href="/archive">Archive</Link>
    <button className="ml-auto underline" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
  </nav>;
}
