import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { authHeader } from "@/lib/auth";
import { Plus, Users, Phone, Calendar, Activity, ExternalLink, Trash2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type Client = {
  id: number; name: string; businessType: string; phone: string; isActive: boolean;
  accessToken: string; createdAt: string; callCount: number; bookingCount: number; contactCount: number;
};
type Stats = { totalClients: number; activeClients: number; totalCalls: number; completedCalls: number };

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeader(), ...(init?.headers as Record<string, string> ?? {}) } })
    .then(r => { if (!r.ok) throw new Error("API error"); return r.json(); });
}

export default function AdminHome() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", businessType: "", phone: "" });

  const { data: clients = [], isLoading } = useQuery<Client[]>({ queryKey: ["admin-clients"], queryFn: () => apiFetch("/admin/clients") });
  const { data: stats } = useQuery<Stats>({ queryKey: ["admin-stats"], queryFn: () => apiFetch("/admin/stats") });

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/admin/clients", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setShowCreate(false);
      setForm({ name: "", businessType: "", phone: "" });
      toast({ title: "Client created" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/admin/clients/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-clients"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: "Client removed" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage accounts and AI voice agents.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Add client
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total clients", value: stats.totalClients, icon: Users },
            { label: "Active", value: stats.activeClients, icon: Activity },
            { label: "Total calls", value: stats.totalCalls, icon: Phone },
            { label: "Completed", value: stats.completedCalls, icon: Calendar },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between text-muted-foreground mb-3">
                <span className="text-xs font-medium">{label}</span>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-bold text-foreground">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Client list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{clients.length} client{clients.length !== 1 ? "s" : ""}</span>
          <button onClick={() => navigate("/admin/calls")} className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
            View all calls →
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No clients yet. Create your first one to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map(client => (
              <div key={client.id} className="px-4 py-3.5 flex items-center gap-4 hover:bg-secondary/30 transition-colors">
                {/* Client info (clickable) */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/admin/clients/${client.id}`)}>
                  <div className="flex items-center gap-2.5">
                    <span className="font-medium text-sm text-foreground">{client.name}</span>
                    {client.businessType && (
                      <span className="text-xs text-muted-foreground">{client.businessType}</span>
                    )}
                    <Badge
                      variant={client.isActive ? "default" : "secondary"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {client.isActive ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{client.contactCount}</span>
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.callCount} calls</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{client.bookingCount} bookings</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={client.isActive}
                    onCheckedChange={v => toggleMutation.mutate({ id: client.id, isActive: v })}
                  />
                  <button
                    onClick={() => { if (confirm(`Delete "${client.name}"? This cannot be undone.`)) deleteMutation.mutate(client.id); }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => navigate(`/admin/clients/${client.id}`)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create client dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">New client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="bg-background border-border" placeholder="Acme Corp" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Industry</Label>
              <Input value={form.businessType} onChange={e => setForm(p => ({ ...p, businessType: e.target.value }))} className="bg-background border-border" placeholder="Roofing, SaaS, Real Estate…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Phone</Label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="bg-background border-border" placeholder="+1 555 000 0000" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
