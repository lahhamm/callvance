import { useState } from "react";
import { useLocation } from "wouter";
import { Terminal, Lock } from "lucide-react";
import { setToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        toast({ title: "Access Denied", description: "Invalid password.", variant: "destructive" });
        return;
      }
      const data = (await res.json()) as { token: string };
      setToken(data.token);
      navigate("/admin");
    } catch {
      toast({ title: "Error", description: "Connection failed.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-mono">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Terminal className="w-6 h-6" />
            <span className="text-2xl font-bold uppercase tracking-widest">NEXUS_VOICE</span>
          </div>
          <p className="text-muted-foreground text-xs uppercase tracking-widest">Admin Access Required</p>
        </div>

        <form onSubmit={handleLogin} className="border border-border bg-card p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
              placeholder="Enter admin password"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-primary text-primary-foreground py-2 text-xs uppercase tracking-widest font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Access System"}
          </button>
        </form>
      </div>
    </div>
  );
}
