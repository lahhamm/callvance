import { useLocation } from "wouter";
import { getAgentsTenantId, getAgentsTenantName, clearAgentsSession } from "@/lib/agents-auth";
import { ConstellationDashboard } from "@/components/agents/constellation-dashboard";
import { Sparkles, LogOut } from "lucide-react";

export default function AgentsPortalPage() {
  const [, navigate] = useLocation();
  const tenantId = getAgentsTenantId();
  const tenantName = getAgentsTenantName();

  const handleLogout = () => {
    clearAgentsSession();
    navigate("/agents/login");
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-400/30">
              <Sparkles className="w-4.5 h-4.5 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">{tenantName ?? "Your workspace"}</h1>
              <p className="text-xs text-slate-500">Your autonomous agent constellation</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>

        {tenantId != null ? (
          <ConstellationDashboard tenantId={tenantId} showDemoTriggers />
        ) : (
          <div className="text-center text-sm text-slate-500 py-16">No tenant is associated with this session.</div>
        )}
      </div>
    </div>
  );
}
