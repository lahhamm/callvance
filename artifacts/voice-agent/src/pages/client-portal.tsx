import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Calendar, LogOut, PhoneCall, ChevronDown, X } from "lucide-react";
import { getClientToken, getClientName, clearSession } from "@/lib/auth";
import { useLocation } from "wouter";

type ClientInfo = {
  id: number; name: string; businessType: string;
  calUsername?: string | null; calEventId?: string | null;
};
type Call = {
  id: number; contactName?: string; contactPhone: string; status: string;
  summary?: string; leadScore?: string; durationSeconds?: number; createdAt: string;
};
type Booking = {
  id: number; contactName?: string; contactPhone?: string;
  scheduledAt: string; notes?: string; timezone?: string | null;
};

declare global {
  interface Window {
    Cal?: ((...args: unknown[]) => void) & {
      loaded?: boolean;
      ns?: Record<string, (...args: unknown[]) => void>;
      q?: unknown[];
    };
  }
}

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

function SummaryModal({ summary, onClose }: { summary: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Call Summary</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}

function CalEmbed({ calUsername, calEventId }: { calUsername: string; calEventId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !containerRef.current) return;
    initialized.current = true;

    const calLink = `${calUsername}/${calEventId}`;

    function initEmbed() {
      if (!window.Cal) return;
      window.Cal("init", "booking", { origin: "https://cal.com" });
      window.Cal("inline", {
        elementOrSelector: "#cal-booking-embed",
        calLink,
        layout: "month_view",
      } as object);
    }

    if (window.Cal) {
      initEmbed();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://app.cal.com/embed/embed.js";
    script.async = true;
    script.onload = () => {
      (function (C: Window, A: string, L: string) {
        const p = function (a: ((...args: unknown[]) => void) & { q: unknown[] }, ar: unknown[]) { a.q.push(ar); };
        const d = C.document;
        C.Cal = C.Cal || function (...args: unknown[]) {
          const cal = C.Cal!;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            const s = d.createElement("script") as HTMLScriptElement;
            s.src = A;
            d.head.appendChild(s);
            cal.loaded = true;
          }
          if (args[0] === L) {
            const api = function (...a: unknown[]) { p(api as ((...args: unknown[]) => void) & { q: unknown[] }, a); };
            const ns = args[1] as string;
            (api as { q: unknown[] }).q = (api as { q: unknown[] }).q || [];
            if (typeof ns === "string") {
              cal.ns![ns] = cal.ns![ns] || (api as (...args: unknown[]) => void);
              p(cal.ns![ns] as ((...args: unknown[]) => void) & { q: unknown[] }, args);
              p(cal as ((...args: unknown[]) => void) & { q: unknown[] }, ["-queue", ns]);
            } else {
              p(cal as ((...args: unknown[]) => void) & { q: unknown[] }, args);
            }
            return;
          }
          p(cal as ((...args: unknown[]) => void) & { q: unknown[] }, args);
        };
      })(window, "https://app.cal.com/embed/embed.js", "init");

      initEmbed();
    };
    document.head.appendChild(script);
  }, [calUsername, calEventId]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ minHeight: 600 }}>
      <div ref={containerRef} id="cal-booking-embed" style={{ width: "100%", height: "100%", minHeight: 600 }} />
    </div>
  );
}

function NoCalConfig() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-10 text-center space-y-2">
      <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
      <p className="text-gray-500 text-sm font-medium">Booking calendar not configured</p>
      <p className="text-gray-400 text-xs">Ask your account manager to connect a Cal.com calendar.</p>
    </div>
  );
}

function formatBookingDate(iso: string, timezone?: string | null) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Date(iso);
  const formatted = date.toLocaleString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const tzAbbr = date.toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop() ?? "";
  return `${formatted} ${tzAbbr}`;
}

function BookingsList({ bookings }: { bookings: Booking[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400" />
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Upcoming Appointments</h3>
        <span className="ml-auto bg-blue-50 text-blue-600 text-xs font-medium px-2 py-0.5 rounded-full">{bookings.length}</span>
      </div>
      {bookings.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">No upcoming appointments scheduled.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {bookings.map(b => (
            <div key={b.id} className="px-5 py-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900">
                  {b.contactName || <span className="italic text-gray-400">Unknown contact</span>}
                </div>
                {b.contactPhone && (
                  <div className="text-xs font-mono text-gray-500 mt-0.5">{b.contactPhone}</div>
                )}
                {b.notes && (
                  <div className="text-xs text-gray-400 mt-1 leading-relaxed">{b.notes}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-medium text-gray-700">{formatBookingDate(b.scheduledAt, b.timezone)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientPortal() {
  const [tab, setTab] = useState<"calls" | "calendar">("calls");
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const token = getClientToken();
  const clientName = getClientName();

  const { data: clientInfo } = useQuery<ClientInfo>({
    queryKey: ["portal-client", token],
    queryFn: () => apiFetch(`/client/${token}`),
    enabled: !!token,
  });

  const { data: calls = [], isLoading: callsLoading } = useQuery<Call[]>({
    queryKey: ["portal-calls", token],
    queryFn: () => apiFetch(`/client/${token}/calls`),
    enabled: !!token,
  });

  const hotLeads = calls.filter(c => c.leadScore?.toLowerCase() === "hot").length;

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ["portal-bookings", token],
    queryFn: () => apiFetch(`/client/${token}/bookings`),
    enabled: !!token,
  });

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  const calReady = !!(clientInfo?.calUsername && clientInfo?.calEventId);

  return (
    <div className="min-h-screen bg-gray-50">
      {expandedSummary && (
        <SummaryModal summary={expandedSummary} onClose={() => setExpandedSummary(null)} />
      )}

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
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Summary <span className="normal-case font-normal text-gray-400">(click to expand)</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {calls.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">
                        {c.contactName
                          ? c.contactName
                          : <span className="text-gray-400 italic text-xs">Unknown</span>}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{c.contactPhone}</td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                        <div>{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        <div className="text-gray-400">{new Date(c.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td className="px-5 py-3.5"><LeadScoreBadge score={c.leadScore} /></td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs max-w-xs">
                        {c.summary ? (
                          <button onClick={() => setExpandedSummary(c.summary!)} className="text-left w-full group">
                            <p className="line-clamp-2 leading-relaxed group-hover:text-gray-800 transition-colors">{c.summary}</p>
                            <span className="inline-flex items-center gap-0.5 text-blue-500 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[11px]">
                              Read more <ChevronDown className="w-3 h-3" />
                            </span>
                          </button>
                        ) : (
                          <span className="text-gray-300">No summary yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Calendar — DB bookings list + Cal.com embed */}
        {tab === "calendar" && (
          <div className="space-y-6">
            <BookingsList bookings={bookings} />
            {calReady
              ? <CalEmbed calUsername={clientInfo!.calUsername!} calEventId={clientInfo!.calEventId!} />
              : <NoCalConfig />
            }
          </div>
        )}
      </div>
    </div>
  );
}
