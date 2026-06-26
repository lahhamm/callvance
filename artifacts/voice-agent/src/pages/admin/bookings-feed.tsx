import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { authHeader } from "@/lib/auth";
import { ArrowLeft, Search, CalendarDays, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Booking = {
  id: number; clientId?: number; clientName?: string;
  contactName?: string; contactPhone?: string;
  scheduledAt: string; status: string; notes?: string; createdAt: string;
  timezone?: string | null;
};

function formatInTz(iso: string, timezone?: string | null) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function formatMonthInTz(iso: string, timezone?: string | null) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date(iso).toLocaleDateString("en-US", { timeZone: tz, month: "short" });
}
function getDayInTz(iso: string, timezone?: string | null) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date(iso).toLocaleDateString("en-US", { timeZone: tz, day: "numeric" });
}
function formatTimeInTz(iso: string, timezone?: string | null) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit",
  });
}
function getTzAbbr(iso: string, timezone?: string | null) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop() ?? "";
}

function apiFetch(path: string) {
  return fetch(`/api${path}`, { headers: { ...authHeader() } }).then(r => r.json());
}

export default function BookingsFeed() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"upcoming" | "all">("upcoming");

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["admin-all-bookings"],
    queryFn: () => apiFetch("/admin/bookings"),
    refetchInterval: 30000,
  });

  const now = new Date();
  const displayed = bookings
    .filter(b => view === "all" || (b.status === "confirmed" && new Date(b.scheduledAt) > now))
    .filter(b =>
      !filter ||
      b.contactName?.toLowerCase().includes(filter.toLowerCase()) ||
      b.contactPhone?.includes(filter) ||
      b.clientName?.toLowerCase().includes(filter.toLowerCase()) ||
      b.status.includes(filter.toLowerCase())
    );

  const upcoming = bookings.filter(b => b.status === "confirmed" && new Date(b.scheduledAt) > now).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">All Bookings</h1>
          <p className="text-sm text-muted-foreground">{upcoming} upcoming · {bookings.length} total</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search by name, phone, or client…"
            className="w-full bg-card border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
          />
        </div>
        <div className="flex bg-card border border-border rounded-lg overflow-hidden shrink-0">
          {(["upcoming", "all"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-2 text-xs font-medium transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v === "upcoming" ? "Upcoming" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {view === "upcoming" ? "No upcoming bookings" : "No bookings found"}
          </div>
        ) : (
          displayed.map(b => {
            const isPast = new Date(b.scheduledAt) < now;
            return (
              <div key={b.id} className={`px-4 py-3.5 flex items-center gap-3 hover:bg-secondary/20 transition-colors ${isPast || b.status === "cancelled" ? "opacity-50" : ""}`}>
                <div className="w-12 shrink-0 text-center">
                  <div className="text-xs font-semibold text-primary">{formatMonthInTz(b.scheduledAt, b.timezone)}</div>
                  <div className="text-lg font-bold text-foreground leading-none">{getDayInTz(b.scheduledAt, b.timezone)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{b.contactName || b.contactPhone || "Unknown"}</span>
                    {b.clientName && (
                      <span className="text-xs border border-border px-2 py-0.5 rounded-full text-muted-foreground">{b.clientName}</span>
                    )}
                    <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs">{b.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatTimeInTz(b.scheduledAt, b.timezone)}
                    <span className="text-xs opacity-60">{getTzAbbr(b.scheduledAt, b.timezone)}</span>
                    {b.notes && <span className="ml-2 truncate">· {b.notes}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
