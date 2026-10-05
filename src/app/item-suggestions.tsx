"use client";
import { useState } from "react";
import { getJson } from "@/lib/client-types";
export default function ItemSuggestions({ name,onChoose }: { name: string; onChoose: (id: string) => void }) {
  const [rows,setRows] = useState<{ schedule_id: number; label: string; examples: number }[]>([]), [message,setMessage] = useState("");
  return <div className="text-xs"><button type="button" className="underline text-blue-600" disabled={name.trim().length < 2} onClick={async () => { try { const result = await getJson<typeof rows>("/api/suggestions?name=" + encodeURIComponent(name)); setRows(result); setMessage(result.length ? "Based on confirmed history; choose a suggestion to apply." : "No matching history. Choose the schedule manually."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load history."); } }}>Suggest schedule from history</button>{message && <p>{message}</p>}{rows.map(row => <button type="button" key={row.schedule_id} className="block mt-1 underline" onClick={() => onChoose(String(row.schedule_id))}>{row.label} · {row.examples} past items</button>)}</div>;
}
