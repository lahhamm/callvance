import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { authHeader } from "@/lib/auth";
import { ArrowLeft, Clock, FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Call = {
  id: number; clientId?: number; clientName?: string; contactName?: string;
  contactPhone: string; status: string; summary?: string; keyInsights?: string;
  leadScore?: string; durationSeconds?: number; createdAt: string; transcript?: string;
};

function apiFetch(path: string) {
  return fetch(`/api${path}`, { headers: { ...authHeader() } }).then(r => r.json());
}

function parseInsights(raw?: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return raw.split("\n").filter(Boolean); }
}

function ScoreBadge({ score }: { score?: string | null }) {
  if (!score) return null;
  const s = score.toLowerCase();
  const styles: Record<string, string> = {
    hot: "bg-green-500/10 text-green-400 border-green-500/20",
    warm: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cold: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[s] ?? "bg-secondary text-muted-foreground"}`}>
      {score}
    </span>
  );
}

export default function GlobalCallsFeed() {
  const [, navigate] = useLocation();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const { data: calls = [], isLoading } = useQuery<Call[]>({
    queryKey: ["admin-all-calls"],
    queryFn: () => apiFetch("/admin/calls"),
    refetchInterval: (query) => {
      const data = query.state.data as Call[] | undefined;
      const hasInProgress = data?.some(c => c.status === "in-progress" || c.status === "queued");
      return hasInProgress ? 5_000 : 30_000;
    },
  });

  const filtered = calls.filter(c =>
    !filter ||
    c.contactName?.toLowerCase().includes(filter.toLowerCase()) ||
    c.contactPhone.includes(filter) ||
    c.clientName?.toLowerCase().includes(filter.toLowerCase()) ||
    c.status.includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/admin")} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">All Calls</h1>
          <p className="text-sm text-muted-foreground">{calls.length} calls across all clients</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search by name, phone, client, or status…"
          className="w-full bg-card border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
        />
      </div>

      {/* Calls list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No calls found</div>
        ) : (
          filtered.map(c => {
            const insights = parseInsights(c.keyInsights);
            return (
              <div key={c.id} className="p-4 space-y-2 hover:bg-secondary/20 transition-colors">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-medium text-sm text-foreground">{c.contactName || c.contactPhone}</span>
                  {c.clientName && (
                    <span className="text-xs border border-border px-2 py-0.5 rounded-full text-muted-foreground">{c.clientName}</span>
                  )}
                  <Badge
                    variant={c.status === "completed" ? "default" : c.status === "failed" ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {c.status}
                  </Badge>
                  <ScoreBadge score={c.leadScore} />
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(c.createdAt).toLocaleString()}</span>
                  {c.durationSeconds && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />{c.durationSeconds}s
                    </span>
                  )}
                  {c.transcript && (
                    <button
                      onClick={() => setTranscript(c.transcript!)}
                      className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                    >
                      <FileText className="w-3 h-3" />Transcript
                    </button>
                  )}
                </div>
                {c.summary && <p className="text-sm text-muted-foreground leading-relaxed">{c.summary}</p>}
                {insights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {insights.map((ins, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full">{ins}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Transcript modal */}
      <Dialog open={!!transcript} onOpenChange={o => !o && setTranscript(null)}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-sm font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Transcript</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs font-mono">
            {transcript?.split("\n").map((line, i) => {
              if (!line.trim()) return null;
              const isAgent = /^(agent|ai|aria|callvance):/i.test(line);
              return <div key={i} className={`p-2.5 rounded-md leading-relaxed ${isAgent ? "bg-primary/10 text-primary border border-primary/20" : "bg-secondary/50 text-muted-foreground"}`}>{line}</div>;
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
