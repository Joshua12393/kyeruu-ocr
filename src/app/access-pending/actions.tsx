"use client";
import { signOut } from "next-auth/react";
export default function PendingActions() { return <div className="mt-7 flex gap-3"><button className="finance-primary" onClick={() => window.location.reload()}>Check my access</button><button className="finance-secondary" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button></div>; }
