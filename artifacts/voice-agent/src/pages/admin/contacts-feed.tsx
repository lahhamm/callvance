import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Search, Phone, Mail, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Contact = {
  id: number; clientId?: number; clientName?: string; name: string; phone: string;
  email?: string; company?: string; status: string; lastCalledAt?: string; createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contacted: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  qualified: "bg-green-500/10 text-green-400 border-green-500/20",
  unqualified: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export default function ContactsFeed() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("");

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["admin-all-contacts"],
    queryFn: () => apiFetch("/admin/contacts"),
    refetchInterval: 30000,
  });

  const filtered = contacts.filter(c =>
    !filter ||
    c.name.toLowerCase().includes(filter.toLowerCase()) ||
    c.phone.includes(filter) ||
    c.email?.toLowerCase().includes(filter.toLowerCase()) ||
    c.company?.toLowerCase().includes(filter.toLowerCase()) ||
    c.clientName?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">All Contacts</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contacts across all clients</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search by name, phone, email, company, or client…"
          className="w-full bg-card border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
        />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No contacts found</div>
        ) : (
          filtered.map(c => (
            <div key={c.id} className="px-4 py-3.5 flex items-center gap-3 hover:bg-secondary/20 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-medium text-sm text-foreground">{c.name}</span>
                  {c.clientName && (
                    <span className="text-xs border border-border px-2 py-0.5 rounded-full text-muted-foreground">{c.clientName}</span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.status] ?? "bg-secondary text-muted-foreground border-border"}`}>
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-mono"><Phone className="w-3 h-3" />{c.phone}</span>
                  {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                  {c.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.company}</span>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0 text-right">
                {c.lastCalledAt
                  ? <span>Called {new Date(c.lastCalledAt).toLocaleDateString()}</span>
                  : <span className="text-muted-foreground/50">Never called</span>
                }
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
