import { useListCalls } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { FileText, Clock, Calendar } from "lucide-react";

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
        <Table>
          <TableHeader className="bg-background/50 border-b border-border">
            <TableRow className="hover:bg-transparent">
              <TableHead className="uppercase text-xs font-bold tracking-wider">Target</TableHead>
              <TableHead className="uppercase text-xs font-bold tracking-wider">Status</TableHead>
              <TableHead className="uppercase text-xs font-bold tracking-wider">Outcome</TableHead>
              <TableHead className="uppercase text-xs font-bold tracking-wider hidden md:table-cell">Duration</TableHead>
              <TableHead className="uppercase text-xs font-bold tracking-wider hidden lg:table-cell">Timestamp</TableHead>
              <TableHead className="text-right uppercase text-xs font-bold tracking-wider">Transcript</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground uppercase text-sm">
                  Loading Logs...
                </TableCell>
              </TableRow>
            ) : calls?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground uppercase text-sm">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              calls?.map((call) => (
                <TableRow key={call.id} className="border-border hover:bg-secondary/20 transition-colors">
                  <TableCell>
                    <div className="font-bold text-sm text-foreground">{call.contactName || 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground">{call.contactPhone}</div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={call.status === 'completed' ? 'default' : call.status === 'failed' ? 'destructive' : 'secondary'} 
                      className="uppercase text-[10px]"
                    >
                      {call.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {call.outcome ? (
                      <span className="text-muted-foreground capitalize">{call.outcome}</span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 mr-1" />
                      {call.durationSeconds ? `${call.durationSeconds}s` : '--'}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3 mr-1" />
                      {new Date(call.createdAt).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {call.transcript && (
                      <button 
                        onClick={() => setSelectedTranscript(call.transcript || null)}
                        className="text-primary hover:text-primary/80 transition-colors p-2 rounded-full hover:bg-primary/10 inline-flex items-center"
                        title="View Transcript"
                        data-testid={`btn-transcript-${call.id}`}
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedTranscript} onOpenChange={(open) => !open && setSelectedTranscript(null)}>
        <DialogContent className="border-border bg-card max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="uppercase tracking-tight text-primary flex items-center">
              <TerminalIcon className="w-4 h-4 mr-2" />
              Raw Transcript Log
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-4">
            {selectedTranscript?.split('\n').map((line, i) => {
              if (!line.trim()) return null;
              const isAgent = line.toLowerCase().startsWith('agent:') || line.toLowerCase().startsWith('ai:');
              return (
                <div key={i} className={`p-3 rounded-none border-l-2 ${isAgent ? 'bg-primary/5 border-primary text-foreground' : 'bg-secondary/30 border-muted-foreground/50 text-muted-foreground'}`}>
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

function TerminalIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  )
}
