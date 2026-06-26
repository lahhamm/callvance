import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { authHeader } from "@/lib/auth";
import { ArrowLeft, Clock, Zap, FileText } from "lucide-react";
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

function scoreBadge(score?: string | null) {
  if (!score) return null;
  const s = score.toLowerCase();
  const map: Record<string, string> = {
    hot: "bg-red-500/20 text-red-400 border-red-500/30",
    warm: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    cold: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return <span className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 font-mono ${map[s] ?? "bg-secondary text-muted-foreground"}`}>{score.toUpperCase()}</span>;
}

export default function GlobalCallsFeed() {
  const [, navigate] = useLocation();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const { data: calls = [], isLoading } = useQuery<Call[]>({
    queryKey: ["admin-all-calls"],
    queryFn: () => apiFetch("/admin/calls"),
    refetchInterval: 30000,
  });

  const filtered = calls.filter(c =>
    !filter ||
    c.contactName?.toLowerCase().includes(filter.toLowerCase()) ||
    c.contactPhone.includes(filter) ||
    c.clientName?.toLowerCase().includes(filter.toLowerCase()) ||
    c.status.includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6 font-mono">
      <div className="flex items-start gap-4">
        <button onClick={() => navigate("/admin")} className="mt-1 text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /></button>
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Global Call Feed</h1>
          <p className="text-muted-foreground mt-1 text-sm">All calls across all clients — {calls.length} total.</p>
        </div>
      </div>

      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name, phone, client, status..."
        className="w-full bg-card border border-border px-4 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
      />

      <div className="border border-border bg-card divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm uppercase">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm uppercase">No calls found</div>
        ) : (
          filtered.map(c => {
            const insights = parseInsights(c.keyInsights);
            return (
              <div key={c.id} className="p-4 space-y-2 hover:bg-secondary/10 transition-colors">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-sm">{c.contactName || c.contactPhone}</span>
                  {c.clientName && (
                    <span className="text-[10px] uppercase tracking-wider border border-border px-2 py-0.5 text-muted-foreground">{c.clientName}</span>
                  )}
                  <Badge variant={c.status === "completed" ? "default" : c.status === "failed" ? "destructive" : "secondary"} className="text-[10px] uppercase">{c.status}</Badge>
                  {scoreBadge(c.leadScore)}
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(c.createdAt).toLocaleString()}</span>
                  {c.durationSeconds && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />{c.durationSeconds}s
                    </span>
                  )}
                  {c.transcript && (
                    <button onClick={() => setTranscript(c.transcript!)} className="text-[10px] uppercase tracking-wider border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10 flex items-center gap-1">
                      <FileText className="w-3 h-3" />Transcript
                    </button>
                  )}
                </div>
                {c.summary && <p className="text-xs text-muted-foreground leading-relaxed">{c.summary}</p>}
                {insights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {insights.map((ins, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
                        <Zap className="w-2.5 h-2.5" />{ins}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={!!transcript} onOpenChange={o => !o && setTranscript(null)}>
        <DialogContent className="border-border bg-card max-w-2xl max-h-[80vh] flex flex-col font-mono">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="uppercase tracking-tight text-primary text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Transcript</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {transcript?.split("\n").map((line, i) => {
              if (!line.trim()) return null;
              const isAgent = /^(agent|ai|aria):/i.test(line);
              return <div key={i} className={`p-2 border-l-2 leading-relaxed ${isAgent ? "bg-primary/5 border-primary" : "bg-secondary/30 border-muted-foreground/50 text-muted-foreground"}`}>{line}</div>;
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
