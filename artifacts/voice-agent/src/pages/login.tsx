import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Lock, PhoneCall } from "lucide-react";
import { setAdminSession, setClientSession } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type LoginResponse =
  | { type: "admin"; token: string }
  | { type: "client"; token: string; clientId: number; clientName: string };

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
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
        setAdminSession(data.token);
        navigate("/admin");
      } else {
        setClientSession(data.token, data.clientId, data.clientName);
        navigate("/portal");
      }
    } catch {
      toast({ title: "Error", description: "Connection failed. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm px-4 space-y-10">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20">
            <PhoneCall className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Callvance</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your password to continue</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-card border border-border rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              placeholder="Enter your password"
              autoFocus
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Continue"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Contact your account manager if you've lost access.
        </p>
      </div>
    </div>
  );
}
