"use client";

import { getJson } from "@/lib/client-types";
import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Calendar,
  Hash,
  Tag,
  ChevronRight
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ActivityType = "IGP" | "MEMBERSHIP" | "FINES" | "EVENTS";
type Semester = "FIRST" | "SECOND" | "SUMMER";

interface ScheduleGroup {
  id: number;
  schedule_number: string;
  activity_type: ActivityType;
  academic_year: string;
  semester: Semester;
  is_closed: boolean;
  schedules: {
    id: number;
    type: "INFLOW" | "OUTFLOW";
    label: string;
  }[];
}

export default function SchedulesPage() {
  const [groups, setGroups] = useState<ScheduleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    schedule_number: "",
    activity_type: "IGP" as ActivityType,
    academic_year: "2026-2027",
    semester: "FIRST" as Semester,
  });

  useEffect(() => {
    fetchSchedules();
  }, []);

  async function fetchSchedules() {
    setLoading(true);
    try {
      const data = await getJson<ScheduleGroup[]>("/api/schedules");
      setGroups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load schedules.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(editingId ? `/api/schedules/${editingId}` : "/api/schedules", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create schedule");
        return;
      }

      setIsModalOpen(false);
      setFormData({
        schedule_number: "",
        activity_type: "IGP",
        academic_year: "2026-2027",
        semester: "FIRST",
      });
      fetchSchedules();
    } catch (e) {
      console.error("Error creating schedule", e);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this schedule group? This action is permanent.")) return;

    try {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete");
        return;
      }
      fetchSchedules();
    } catch (e) {
      console.error("Error deleting schedule", e);
    }
  }

  async function closeTerm(groupId: number) {
    if (!confirm("Close this schedule group? Further record changes will be blocked.")) return;
    try {
      const response = await fetch("/api/term", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not close term.");
      await fetchSchedules();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not close term."); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedule Groups</h1>
          <p className="text-muted-foreground text-gray-500">
            Manage your financial schedule groups and their inflow/outflow sides.
          </p>
        </div>
        <button
          onClick={() => { setEditingId(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <Plus size={18} /> Create Group
        </button>
      </div>

      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <div key={group.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 text-blue-600 font-semibold">
                <Hash size={16} />
                <span>{group.schedule_number}</span>
              </div>
              <div className="flex gap-2">
                <button disabled={group.is_closed} onClick={() => { setEditingId(group.id); setFormData({ schedule_number: group.schedule_number, activity_type: group.activity_type, academic_year: group.academic_year, semester: group.semester }); setIsModalOpen(true); }} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(group.id)}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Tag size={14} />
                <span className="font-medium">{group.activity_type}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar size={14} />
                <span>{group.semester} {group.academic_year}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              {group.is_closed ? <p className="text-sm font-bold">Closed term</p> : <button className="text-sm underline mb-2" onClick={() => closeTerm(group.id)}>Close term</button>}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Linked Schedules</p>
              <div className="space-y-2">
                {group.schedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50">
                    <span className="flex items-center gap-2">
                      <ChevronRight size={14} className={s.type === 'INFLOW' ? 'text-green-500' : 'text-red-500'} />
                      <span className="text-gray-700">{s.label}</span>
                    </span>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                      s.type === 'INFLOW' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {s.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold">{editingId ? "Edit Schedule Group" : "Create New Schedule Group"}</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Schedule Number</label>
                <input
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. 2026-001"
                  value={formData.schedule_number}
                  onChange={e => setFormData({...formData, schedule_number: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Activity Type</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.activity_type}
                  onChange={e => setFormData({...formData, activity_type: e.target.value as ActivityType})}
                >
                  <option value="IGP">IGP (Income Generating Project)</option>
                  <option value="MEMBERSHIP">Membership</option>
                  <option value="FINES">Fines</option>
                  <option value="EVENTS">Events</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Academic Year</label>
                  <input
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="2026-2027"
                    value={formData.academic_year}
                    onChange={e => setFormData({...formData, academic_year: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Semester</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.semester}
                    onChange={e => setFormData({...formData, semester: e.target.value as Semester})}
                  >
                    <option value="FIRST">First Semester</option>
                    <option value="SECOND">Second Semester</option>
                    <option value="SUMMER">Summer</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
