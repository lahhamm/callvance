import { useGetCallStats, useListCalls } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Phone, PhoneCall, PhoneForwarded, Users, ChevronRight, Zap } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

type CallItem = {
  id: number;
  contactName?: string | null;
  contactPhone: string;
  status: string;
  durationSeconds?: number | null;
  summary?: string | null;
  keyInsights?: string | null;
};

function parseInsights(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch { /* not JSON */ }
  return raw.split("\n").filter(Boolean);
}

function CommLogRow({ call }: { call: CallItem }) {
  const insights = parseInsights(call.keyInsights);
  const hasExtra = call.summary || insights.length > 0;

  return (
    <div
      className="p-4 hover:bg-secondary/20 transition-colors border-b border-border last:border-0"
      data-testid={`comm-log-row-${call.id}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-sm text-foreground truncate">
            {call.contactName || call.contactPhone}
          </span>
          {call.contactName && (
            <span className="text-xs text-muted-foreground">{call.contactPhone}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge
            variant={call.status === "completed" ? "default" : call.status === "failed" ? "destructive" : "secondary"}
            className="uppercase text-[10px]"
          >
            {call.status}
          </Badge>
          <span className="text-xs text-muted-foreground w-12 text-right">
            {call.durationSeconds ? `${call.durationSeconds}s` : "--"}
          </span>
          <Link href="/calls" className="text-muted-foreground hover:text-primary transition-colors">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {hasExtra && (
        <div className="mt-2 space-y-1.5">
          {call.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {call.summary}
            </p>
          )}
          {insights.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {insights.slice(0, 3).map((insight, i) => (
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
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetCallStats();
  const { data: calls, isLoading: callsLoading } = useListCalls();

  const recentCalls = (calls?.slice(0, 5) || []) as CallItem[];

  return (
    <div className="space-y-8 font-mono">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-foreground">Command Center</h1>
          <p className="text-muted-foreground mt-1 text-sm">System metrics and recent activity overview.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase animate-pulse">
          <Activity className="w-4 h-4" />
          Live
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Calls" value={stats?.total} icon={Phone} loading={statsLoading} testId="stat-total" />
        <StatCard title="Completed" value={stats?.completed} icon={PhoneForwarded} loading={statsLoading} testId="stat-completed" valueClass="text-primary" />
        <StatCard title="Failed" value={stats?.failed} icon={PhoneCall} loading={statsLoading} testId="stat-failed" valueClass="text-destructive" />
        <StatCard title="Total Contacts" value={stats?.totalContacts} icon={Users} loading={statsLoading} testId="stat-contacts" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-sm font-bold uppercase text-muted-foreground flex items-center justify-between">
              Recent Comm Log
              <Link href="/calls" className="text-primary hover:underline text-xs">View All</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {callsLoading ? (
              <div className="p-4 space-y-4">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : recentCalls.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground uppercase">No recent activity</div>
            ) : (
              <div>
                {recentCalls.map(call => <CommLogRow key={call.id} call={call} />)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-sm font-bold uppercase text-muted-foreground">System Status</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground uppercase">API Connection</span>
              <Badge variant="default" className="bg-primary/20 text-primary border border-primary/50 uppercase text-[10px]">Online</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground uppercase">Voice Agent</span>
              <Badge variant="default" className="bg-primary/20 text-primary border border-primary/50 uppercase text-[10px]">Ready</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground uppercase">Avg Duration</span>
              <span className="font-bold text-foreground">
                {statsLoading ? <Skeleton className="h-4 w-12" /> : stats?.avgDurationSeconds ? `${Math.round(stats.avgDurationSeconds)}s` : "--"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, loading, testId, valueClass = "text-foreground"
}: {
  title: string; value?: number | null; icon: any; loading: boolean; testId: string; valueClass?: string;
}) {
  return (
    <Card className="border-border bg-card" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
        <CardTitle className="text-xs font-bold uppercase text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pt-4">
        <div className={`text-4xl font-bold tracking-tight ${valueClass}`}>
          {loading ? <Skeleton className="h-10 w-20" /> : (value ?? 0)}
        </div>
      </CardContent>
    </Card>
  );
}
