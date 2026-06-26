import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Phone, Calendar, Clock, User } from "lucide-react";

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
    hot: "bg-red-50 text-red-600 border-red-200",
    warm: "bg-amber-50 text-amber-600 border-amber-200",
    cold: "bg-blue-50 text-blue-600 border-blue-200",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${styles[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {score.toUpperCase()}
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
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [tab, setTab] = useState<"calls" | "calendar">("calls");

  const { data: client, isLoading: clientLoading, isError } = useQuery<ClientInfo>({
    queryKey: ["portal-client", token],
    queryFn: () => apiFetch(`/client/${token}`),
    retry: false,
  });

  const { data: calls = [], isLoading: callsLoading } = useQuery<Call[]>({
    queryKey: ["portal-calls", token],
    queryFn: () => apiFetch(`/client/${token}/calls`),
    enabled: !!client,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["portal-bookings", token],
    queryFn: () => apiFetch(`/client/${token}/bookings`),
    enabled: !!client,
  });

  if (clientLoading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading...</div>
    </div>
  );

  if (isError || !client) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-2xl font-semibold text-gray-800">Page not found</div>
        <div className="text-gray-400 text-sm">This link may be invalid or expired.</div>
      </div>
    </div>
  );

  const completedCalls = calls.filter(c => c.status === "completed");
  const hotLeads = calls.filter(c => c.leadScore?.toLowerCase() === "hot").length;
  const warmLeads = calls.filter(c => c.leadScore?.toLowerCase() === "warm").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{client.name}</h1>
            {client.businessType && <p className="text-sm text-gray-500 mt-0.5">{client.businessType}</p>}
          </div>
          <div className="text-xs text-gray-400 uppercase tracking-widest">Powered by NEXUS_VOICE</div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Calls", value: calls.length },
            { label: "Hot Leads", value: hotLeads },
            { label: "Appointments", value: bookings.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</div>
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
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Call Log */}
        {tab === "calls" && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {callsLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading calls...</div>
            ) : calls.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No calls yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Lead", "Phone", "Time", "Score", "Summary"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {calls.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{c.contactName || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.contactPhone}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        <div>{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        <div className="text-gray-400">{new Date(c.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td className="px-4 py-3"><LeadScoreBadge score={c.leadScore} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs">
                        {c.summary ? (
                          <p className="line-clamp-2 leading-relaxed">{c.summary}</p>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Calendar / Appointments */}
        {tab === "calendar" && (
          <div className="space-y-3">
            {bookingsLoading ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">Loading...</div>
            ) : bookings.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
                No upcoming appointments.
              </div>
            ) : (
              bookings.map(b => (
                <div key={b.id} className="bg-white border border-gray-200 rounded-lg p-5 flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-900 text-white rounded-lg flex flex-col items-center justify-center shrink-0">
                    <div className="text-xs font-semibold uppercase">{new Date(b.scheduledAt).toLocaleDateString("en-US", { month: "short" })}</div>
                    <div className="text-lg font-bold leading-none">{new Date(b.scheduledAt).getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
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
