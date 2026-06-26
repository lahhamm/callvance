import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Calendar, Clock, LogOut, PhoneCall } from "lucide-react";
import { getClientToken, getClientName, clearSession } from "@/lib/auth";
import { useLocation } from "wouter";

type ClientInfo = { id: number; name: string; businessType: string };
type Call = {
  id: number; contactName?: string; contactPhone: string; status: string;
  summary?: string; leadScore?: string; durationSeconds?: number; createdAt: string;
};
type Booking = {
  id: number; contactName?: string; contactPhone?: string;
  scheduledAt: string; notes?: string;
};

function apiFetch(path: string) {
  return fetch(`/api${path}`).then(r => { if (!r.ok) throw new Error("not found"); return r.json(); });
}

function LeadScoreBadge({ score }: { score?: string | null }) {
  if (!score) return null;
  const s = score.toLowerCase();
  const styles: Record<string, string> = {
    hot: "bg-green-50 text-green-700 border-green-200",
    warm: "bg-amber-50 text-amber-700 border-amber-200",
    cold: "bg-slate-100 text-slate-500 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${styles[s] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
      {score}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ClientPortal() {
  const [tab, setTab] = useState<"calls" | "calendar">("calls");
  const [, navigate] = useLocation();
  const token = getClientToken();
  const clientName = getClientName();

  const { data: calls = [], isLoading: callsLoading } = useQuery<Call[]>({
    queryKey: ["portal-calls", token],
    queryFn: () => apiFetch(`/client/${token}/calls`),
    enabled: !!token,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["portal-bookings", token],
    queryFn: () => apiFetch(`/client/${token}/bookings`),
    enabled: !!token,
  });

  const hotLeads = calls.filter(c => c.leadScore?.toLowerCase() === "hot").length;
  const warmLeads = calls.filter(c => c.leadScore?.toLowerCase() === "warm").length;

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <PhoneCall className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-sm text-gray-900">{clientName ?? "Your Dashboard"}</span>
              <span className="text-gray-400 text-xs ml-2">via Callvance</span>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Calls", value: calls.length },
            { label: "Hot Leads", value: hotLeads },
            { label: "Appointments", value: bookings.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { id: "calls", label: "Call Log", icon: Phone },
            { id: "calendar", label: "Appointments", icon: Calendar },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as "calls" | "calendar")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Call Log */}
        {tab === "calls" && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {callsLoading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
            ) : calls.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">No calls recorded yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Lead", "Phone", "Date", "Score", "Summary"].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {calls.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{c.contactName || "—"}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{c.contactPhone}</td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                        <div>{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        <div className="text-gray-400">{new Date(c.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td className="px-5 py-3.5"><LeadScoreBadge score={c.leadScore} /></td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs max-w-xs">
                        {c.summary
                          ? <p className="line-clamp-2 leading-relaxed">{c.summary}</p>
                          : <span className="text-gray-300">No summary</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Calendar */}
        {tab === "calendar" && (
          <div className="space-y-3">
            {bookingsLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">Loading…</div>
            ) : bookings.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center space-y-1">
                <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm font-medium">No upcoming appointments</p>
                <p className="text-gray-400 text-xs">Bookings confirmed via AI calls will appear here.</p>
              </div>
            ) : (
              bookings.map(b => (
                <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex flex-col items-center justify-center shrink-0">
                    <div className="text-[10px] font-semibold uppercase leading-none">
                      {new Date(b.scheduledAt).toLocaleDateString("en-US", { month: "short" })}
                    </div>
                    <div className="text-lg font-bold leading-tight">{new Date(b.scheduledAt).getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-gray-900">{b.contactName || "Lead"}</span>
                      {b.contactPhone && (
                        <span className="text-sm text-gray-500 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />{b.contactPhone}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-1 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {formatDate(b.scheduledAt)}
                    </div>
                    {b.notes && <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{b.notes}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
