import { useListCalls } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { FileText, Clock, Calendar, Zap, ChevronDown, ChevronUp } from "lucide-react";

type CallRow = {
  id: number;
  contactName?: string | null;
  contactPhone: string;
  status: string;
  durationSeconds?: number | null;
  createdAt: string;
  outcome?: string | null;
  summary?: string | null;
  keyInsights?: string | null;
  transcript?: string | null;
};

function parseInsights(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch { /* not JSON */ }
  return raw.split("\n").filter(Boolean);
}

function statusVariant(status: string): "default" | "destructive" | "secondary" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

function CallCard({ call, onViewTranscript }: { call: CallRow; onViewTranscript: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const insights = parseInsights(call.keyInsights);
  const hasExtra = call.summary || insights.length > 0;

  return (
    <div
      className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors"
      data-testid={`call-row-${call.id}`}
    >
      {/* Main row */}
      <div className="p-4 flex items-start gap-4">
        {/* Contact info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-sm text-foreground">
              {call.contactName || call.contactPhone}
            </span>
            {call.contactName && (
              <span className="text-xs text-muted-foreground">{call.contactPhone}</span>
            )}
            <Badge variant={statusVariant(call.status)} className="uppercase text-[10px]">
              {call.status}
            </Badge>
          </div>

          {/* Summary — always visible if present */}
          {call.summary && (
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {call.summary}
            </p>
          )}

          {/* Key insights */}
          {insights.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {insights.map((insight, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider"
                  data-testid={`insight-${call.id}-${i}`}
                >
                  <Zap className="w-2.5 h-2.5" />
                  {insight}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right side: meta + actions */}
        <div className="flex flex-col items-end gap-2 shrink-0 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {call.durationSeconds ? `${call.durationSeconds}s` : "--"}
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(call.createdAt).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {call.transcript && (
              <button
                onClick={() => onViewTranscript(call.transcript!)}
                className="text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1 text-[10px] uppercase tracking-wider border border-primary/30 px-2 py-1 hover:bg-primary/10"
                data-testid={`btn-transcript-${call.id}`}
              >
                <FileText className="w-3 h-3" />
                Transcript
              </button>
            )}
            {call.outcome && (
              <span className="text-[10px] text-muted-foreground italic">{call.outcome}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Calls() {
  const { data: calls, isLoading } = useListCalls();
  const [selectedTranscript, setSelectedTranscript] = useState<string | null>(null);

  return (
    <div className="space-y-6 font-mono">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Comm Log</h1>
        <p className="text-muted-foreground mt-1 text-sm">Historical record of all agent outbound calls.</p>
      </div>

      <div className="border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground uppercase text-sm">Loading Logs...</div>
        ) : !calls?.length ? (
          <div className="p-8 text-center text-muted-foreground uppercase text-sm">No records found</div>
        ) : (
          <div>
            {(calls as CallRow[]).map((call) => (
              <CallCard key={call.id} call={call} onViewTranscript={setSelectedTranscript} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedTranscript} onOpenChange={(open) => !open && setSelectedTranscript(null)}>
        <DialogContent className="border-border bg-card max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="uppercase tracking-tight text-primary flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Transcript Log
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-3">
            {selectedTranscript?.split("\n").map((line, i) => {
              if (!line.trim()) return null;
              const isAgent =
                line.toLowerCase().startsWith("agent:") ||
                line.toLowerCase().startsWith("ai:") ||
                line.toLowerCase().startsWith("aria:");
              const isCustomer =
                line.toLowerCase().startsWith("customer:") ||
                line.toLowerCase().startsWith("user:");
              return (
                <div
                  key={i}
                  className={`p-3 border-l-2 text-xs leading-relaxed ${
                    isAgent
                      ? "bg-primary/5 border-primary text-foreground"
                      : isCustomer
                      ? "bg-secondary/30 border-muted-foreground/50 text-muted-foreground"
                      : "text-muted-foreground/70 border-transparent pl-4"
                  }`}
                >
                  {line}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
