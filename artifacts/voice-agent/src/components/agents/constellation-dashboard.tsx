import { useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { agentsApiFetch } from "@/lib/agents-api";
import {
  Brain,
  PhoneCall,
  ListFilter,
  Repeat,
  CalendarCheck,
  FileText,
  PhoneMissed,
  MessageSquareText,
  Users,
  Send,
  CalendarCheck2,
  TrendingUp,
  DollarSign,
  Radio,
} from "lucide-react";

type AgentKey = "lead" | "reception" | "qualifier" | "followup" | "booking" | "content";
type AgentStatus = "working" | "waiting" | "idle";

type AgentInfo = {
  agentKey: AgentKey;
  name: string;
  enabled: boolean;
  status: AgentStatus;
  currentTask: string;
};

type Metrics = {
  leadsCaptured: number;
  repliesSent: number;
  bookingsMade: number;
  missedRecovered: number;
  pipelineValue: number;
};

type ActivityEntry = {
  id: number;
  agentKey: AgentKey;
  action: string;
  description: string;
  leadId: number | null;
  createdAt: string;
};

const ORBIT_KEYS: AgentKey[] = ["reception", "qualifier", "followup", "booking", "content"];

const AGENT_ICONS: Record<AgentKey, typeof Brain> = {
  lead: Brain,
  reception: PhoneCall,
  qualifier: ListFilter,
  followup: Repeat,
  booking: CalendarCheck,
  content: FileText,
};

const STATUS_STYLES: Record<AgentStatus, { dot: string; text: string; ring: string; label: string }> = {
  working: { dot: "bg-emerald-400", text: "text-emerald-300", ring: "border-emerald-400/40 bg-emerald-400/10", label: "Working" },
  waiting: { dot: "bg-amber-400", text: "text-amber-300", ring: "border-amber-400/40 bg-amber-400/10", label: "Waiting" },
  idle: { dot: "bg-slate-500", text: "text-slate-400", ring: "border-slate-500/30 bg-slate-500/10", label: "Idle" },
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function StarField() {
  const stars = useMemo(() => {
    const arr: { top: number; left: number; size: number; delay: number }[] = [];
    for (let i = 0; i < 70; i++) {
      arr.push({
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() < 0.8 ? 1 : 2,
        delay: Math.random() * 5,
      });
    }
    return arr;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s, i) => (
        <div
          key={i}
          className="agents-star absolute rounded-full bg-white"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            opacity: 0.6,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function AgentNode({ agent, style }: { agent: AgentInfo; style?: React.CSSProperties }) {
  const Icon = AGENT_ICONS[agent.agentKey];
  const st = STATUS_STYLES[agent.status];
  return (
    <div
      className="absolute w-[168px] -translate-x-1/2 -translate-y-1/2"
      style={style}
    >
      <div
        className={`rounded-xl border backdrop-blur-sm bg-slate-900/70 border-slate-700/60 px-3.5 py-3 shadow-lg shadow-black/30 transition-transform hover:scale-[1.04] ${
          agent.status === "working" ? "agents-working-pulse" : ""
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`flex items-center justify-center w-7 h-7 rounded-lg border ${st.ring}`}>
            <Icon className={`w-3.5 h-3.5 ${st.text}`} />
          </div>
          <span className="text-xs font-semibold text-slate-100 truncate">{agent.name}</span>
        </div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${agent.status === "working" ? "motion-safe:animate-pulse" : ""}`} />
          <span className={`text-[10px] font-medium uppercase tracking-wide ${st.text}`}>{st.label}</span>
        </div>
        <p className="text-[11px] leading-snug text-slate-400 line-clamp-2">{agent.currentTask}</p>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm px-4 py-3.5 flex items-center gap-3">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-400/20 shrink-0">
        <Icon className="w-4 h-4 text-indigo-300" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-white leading-tight truncate">{value}</div>
        <div className="text-[11px] text-slate-400 truncate">{label}</div>
      </div>
    </div>
  );
}

export function ConstellationDashboard({
  tenantId,
  showDemoTriggers = true,
}: {
  tenantId: number;
  showDemoTriggers?: boolean;
}) {
  const qc = useQueryClient();

  const { data: agents = [], isLoading: agentsLoading } = useQuery<AgentInfo[]>({
    queryKey: ["agents-status", tenantId],
    queryFn: () => agentsApiFetch(`/tenants/${tenantId}/agents`) as Promise<AgentInfo[]>,
    refetchInterval: 3000,
  });

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["agents-metrics", tenantId],
    queryFn: () => agentsApiFetch(`/tenants/${tenantId}/metrics`) as Promise<Metrics>,
    refetchInterval: 8000,
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["agents-activity", tenantId],
    queryFn: () => agentsApiFetch(`/tenants/${tenantId}/activity?limit=30`) as Promise<ActivityEntry[]>,
    refetchInterval: 4000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["agents-status", tenantId] });
    qc.invalidateQueries({ queryKey: ["agents-activity", tenantId] });
    qc.invalidateQueries({ queryKey: ["agents-metrics", tenantId] });
    qc.invalidateQueries({ queryKey: ["agents-leads", tenantId] });
  };

  const missedCallMutation = useMutation({
    mutationFn: () => agentsApiFetch(`/tenants/${tenantId}/demo/missed-call`, { method: "POST" }),
    onSuccess: invalidateAll,
  });

  const inboundTextMutation = useMutation({
    mutationFn: () => agentsApiFetch(`/tenants/${tenantId}/demo/inbound-text`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: invalidateAll,
  });

  const leadAgent = agents.find(a => a.agentKey === "lead") ?? null;
  const orbitAgents = ORBIT_KEYS.map(key => agents.find(a => a.agentKey === key)).filter(Boolean) as AgentInfo[];

  const radius = 230;
  const orbitPositions = ORBIT_KEYS.map((_, i) => {
    const angle = (2 * Math.PI * i) / ORBIT_KEYS.length - Math.PI / 2;
    return {
      left: `calc(50% + ${Math.cos(angle) * radius}px)`,
      top: `calc(50% + ${Math.sin(angle) * radius}px)`,
    };
  });

  return (
    <div className="space-y-5">
      {/* Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard icon={Users} label="Leads captured" value={metrics?.leadsCaptured ?? "—"} />
        <MetricCard icon={Send} label="Replies sent" value={metrics?.repliesSent ?? "—"} />
        <MetricCard icon={CalendarCheck2} label="Bookings made" value={metrics?.bookingsMade ?? "—"} />
        <MetricCard icon={TrendingUp} label="Missed recovered" value={metrics?.missedRecovered ?? "—"} />
        <MetricCard icon={DollarSign} label="Pipeline value" value={metrics ? formatCurrency(metrics.pipelineValue) : "—"} />
      </div>

      {showDemoTriggers && (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => missedCallMutation.mutate()}
            disabled={missedCallMutation.isPending}
            className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800 hover:border-indigo-400/40 transition-colors disabled:opacity-50"
          >
            <PhoneMissed className="w-3.5 h-3.5 text-indigo-300" />
            {missedCallMutation.isPending ? "Simulating…" : "Simulate missed call"}
          </button>
          <button
            onClick={() => inboundTextMutation.mutate()}
            disabled={inboundTextMutation.isPending}
            className="inline-flex items-center gap-2 text-xs font-medium px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800 hover:border-indigo-400/40 transition-colors disabled:opacity-50"
          >
            <MessageSquareText className="w-3.5 h-3.5 text-indigo-300" />
            {inboundTextMutation.isPending ? "Simulating…" : "Simulate inbound text"}
          </button>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 ml-1">
            <Radio className="w-3 h-3 motion-safe:animate-pulse text-emerald-400" /> live
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        {/* Constellation stage */}
        <div className="relative rounded-2xl border border-slate-800 bg-[#05070d] overflow-hidden" style={{ height: 620 }}>
          <StarField />
          <div
            className="agents-nebula-a absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(99,102,241,0.55), transparent 70%)" }}
          />
          <div
            className="agents-nebula-b absolute -bottom-32 -right-24 w-[460px] h-[460px] rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.5), transparent 70%)" }}
          />
          <div
            className="agents-nebula-a absolute top-1/3 right-10 w-[280px] h-[280px] rounded-full opacity-10 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(168,85,247,0.5), transparent 70%)", animationDelay: "20s" }}
          />

          {agentsLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">Loading agent constellation…</div>
          ) : (
            <div className="absolute inset-0">
              {/* Orbit ring guide */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-slate-700/40 pointer-events-none"
                style={{ width: radius * 2, height: radius * 2 }}
              />

              {/* Central Lead Agent node */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="agents-core-glow relative flex flex-col items-center justify-center w-[168px] h-[168px] rounded-full bg-gradient-to-b from-indigo-500/25 to-indigo-900/40 border border-indigo-400/40">
                  <div className="flex items-center justify-center w-11 h-11 rounded-full bg-indigo-500/20 border border-indigo-300/40 mb-2">
                    <Brain className="w-5 h-5 text-indigo-200" />
                  </div>
                  <span className="text-sm font-semibold text-white">Lead Agent</span>
                  {leadAgent && (
                    <span className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[leadAgent.status].text}`}>
                      {STATUS_STYLES[leadAgent.status].label}
                    </span>
                  )}
                </div>
                {leadAgent && (
                  <p className="mt-2 text-[11px] text-center text-slate-400 max-w-[180px] mx-auto line-clamp-2">
                    {leadAgent.currentTask}
                  </p>
                )}
              </div>

              {/* Orbit agent nodes */}
              {orbitAgents.map((agent, i) => (
                <AgentNode key={agent.agentKey} agent={agent} style={orbitPositions[i]} />
              ))}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex flex-col" style={{ height: 620 }}>
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-sm font-semibold text-slate-100">Live activity</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
            {activityLoading ? (
              <div className="p-6 text-center text-sm text-slate-500">Loading activity…</div>
            ) : activity.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No activity yet. Trigger a demo event to see agents react.</div>
            ) : (
              activity.map(entry => {
                const Icon = AGENT_ICONS[entry.agentKey] ?? Brain;
                return (
                  <div key={entry.id} className="px-4 py-3 flex items-start gap-2.5">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700 shrink-0 mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-indigo-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-200 leading-snug">{entry.description}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{formatRelativeTime(entry.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConstellationDashboard;
