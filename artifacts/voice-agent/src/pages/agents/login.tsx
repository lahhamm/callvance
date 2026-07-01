import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Lock, Sparkles } from "lucide-react";
import {
  setAgentsAdminSession,
  setAgentsTenantSession,
  isAgentsAdminAuthenticated,
  isAgentsTenantAuthenticated,
} from "@/lib/agents-auth";
import { useToast } from "@/hooks/use-toast";

type LoginResponse =
  | { type: "admin"; token: string }
  | { type: "tenant"; token: string; tenantId: number; businessName: string };

export default function AgentsLoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    document.documentElement.classList.add("dark");
    if (isAgentsAdminAuthenticated()) { navigate("/agents/admin"); return; }
    if (isAgentsTenantAuthenticated()) { navigate("/agents/portal"); return; }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/agents/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        toast({ title: "Access denied", description: "Incorrect password.", variant: "destructive" });
        return;
      }
      const data = (await res.json()) as LoginResponse;
      if (data.type === "admin") {
        setAgentsAdminSession(data.token);
        navigate("/agents/admin");
      } else {
        setAgentsTenantSession(data.token, data.tenantId, data.businessName);
        navigate("/agents/portal");
      }
    } catch {
      toast({ title: "Error", description: "Connection failed. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070d] flex items-center justify-center relative overflow-hidden">
      {/* Starfield backdrop */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.6) 0%, transparent 100%)," +
            "radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.4) 0%, transparent 100%)," +
            "radial-gradient(1.5px 1.5px at 40% 80%, rgba(255,255,255,0.5) 0%, transparent 100%)," +
            "radial-gradient(1px 1px at 85% 15%, rgba(255,255,255,0.4) 0%, transparent 100%)," +
            "radial-gradient(1px 1px at 55% 45%, rgba(255,255,255,0.3) 0%, transparent 100%)",
          backgroundSize: "600px 600px",
        }}
      />
      <div
        className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.5), transparent 70%)" }}
      />
      <div
        className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.5), transparent 70%)" }}
      />

      <div className="w-full max-w-sm px-4 space-y-10 relative z-10">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-400/30 shadow-[0_0_30px_rgba(99,102,241,0.35)]">
            <Sparkles className="w-6 h-6 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Callvance Agents</h1>
            <p className="text-sm text-slate-400 mt-1">Autonomous AI agent workforce — sign in to continue</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-200 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 transition-all"
              placeholder="Enter your password"
              autoFocus
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-indigo-500 hover:bg-indigo-400 text-white py-2.5 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(99,102,241,0.35)]"
          >
            {loading ? "Signing in…" : "Continue"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Callvance Agents is a separate product from Callvance Receptionist.
        </p>
      </div>
    </div>
  );
}
