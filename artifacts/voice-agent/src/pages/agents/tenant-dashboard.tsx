import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { agentsApiFetch } from "@/lib/agents-api";
import { clearAgentsSession } from "@/lib/agents-auth";
import { ConstellationDashboard } from "@/components/agents/constellation-dashboard";
import { Sparkles, LogOut, ChevronDown, ArrowLeft } from "lucide-react";
import { useState } from "react";

type TenantSummary = {
  id: number;
  businessName: string;
  serviceType: string;
  serviceArea: string;
  plan: string;
  isDemo: boolean;
  isActive: boolean;
  leadCount: number;
};

export default function AgentsTenantDashboardPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const tenantId = Number(params.id);

  const { data: tenants = [] } = useQuery<TenantSummary[]>({
    queryKey: ["agents-tenants"],
    queryFn: () => agentsApiFetch("/tenants") as Promise<TenantSummary[]>,
  });

  const current = tenants.find(t => t.id === tenantId);

  const handleLogout = () => {
    clearAgentsSession();
    navigate("/agents/login");
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/agents/admin")}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
              title="Back to tenant list"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-400/30">
              <Sparkles className="w-4.5 h-4.5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-white">
                  {current?.businessName ?? "Loading…"}
                </h1>
                {current?.isDemo && (
                  <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-300">
                    Demo
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{current?.serviceType ?? "Agent constellation"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tenant switcher */}
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen(o => !o)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Switch tenant <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {switcherOpen && (
                <div className="absolute right-0 mt-1.5 w-64 max-h-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl z-20">
                  {tenants.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setSwitcherOpen(false); navigate(`/agents/admin/tenants/${t.id}`); }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-800 transition-colors ${
                        t.id === tenantId ? "text-indigo-300 bg-slate-800/60" : "text-slate-300"
                      }`}
                    >
                      {t.businessName}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Log out
            </button>
          </div>
        </div>

        {Number.isFinite(tenantId) && <ConstellationDashboard tenantId={tenantId} showDemoTriggers />}
      </div>
    </div>
  );
}
