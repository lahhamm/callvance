import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { agentsApiFetch } from "@/lib/agents-api";
import { clearAgentsSession } from "@/lib/agents-auth";
import { Sparkles, Users, MapPin, LogOut, ChevronRight } from "lucide-react";

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

export default function AgentsAdminHome() {
  const [, navigate] = useLocation();

  const { data: tenants = [], isLoading } = useQuery<TenantSummary[]>({
    queryKey: ["agents-tenants"],
    queryFn: () => agentsApiFetch("/tenants") as Promise<TenantSummary[]>,
  });

  // Auto-redirect straight to the first tenant's dashboard once loaded.
  useEffect(() => {
    if (!isLoading && tenants.length > 0) {
      navigate(`/agents/admin/tenants/${tenants[0].id}`);
    }
  }, [isLoading, tenants]);

  const handleLogout = () => {
    clearAgentsSession();
    navigate("/agents/login");
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-100">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-400/30">
              <Sparkles className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Callvance Agents</h1>
              <p className="text-xs text-slate-500">Select a tenant to view their agent constellation</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>

        {isLoading ? (
          <div className="text-center text-sm text-slate-500 py-16">Loading tenants…</div>
        ) : tenants.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-16">No tenants found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenants.map(t => (
              <button
                key={t.id}
                onClick={() => navigate(`/agents/admin/tenants/${t.id}`)}
                className="text-left rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-indigo-400/40 transition-colors p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-white truncate">{t.businessName}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" /> {t.serviceArea || "—"}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-300">
                    {t.plan}
                  </span>
                  {t.isDemo && (
                    <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-300">
                      Demo
                    </span>
                  )}
                  {!t.isActive && (
                    <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-slate-600 bg-slate-800 text-slate-400">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800">
                  <span className="truncate">{t.serviceType || "—"}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Users className="w-3 h-3" /> {t.leadCount} leads
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
