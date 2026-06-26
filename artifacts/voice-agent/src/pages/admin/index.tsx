import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { authHeader } from "@/lib/auth";
import { Plus, Users, Phone, Calendar, ToggleLeft, ToggleRight, ExternalLink, Trash2, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Client = {
  id: number; name: string; businessType: string; phone: string; isActive: boolean;
  accessToken: string; createdAt: string; callCount: number; bookingCount: number; contactCount: number;
};
type Stats = { totalClients: number; activeClients: number; totalCalls: number; completedCalls: number };

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeader(), ...(init?.headers as Record<string, string> ?? {}) } }).then(r => r.json());
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-clients"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); setShowCreate(false); setForm({ name: "", businessType: "", phone: "" }); toast({ title: "Client created" }); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiFetch(`/admin/clients/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-clients"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-clients"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); toast({ title: "Client removed" }); },
  });

  const portalUrl = (token: string) => `${window.location.origin}/client/${token}`;

  return (
    <div className="space-y-6 font-mono">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Admin Console</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage all clients and AI voice agents.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 text-xs uppercase tracking-wider border border-primary/40 px-3 py-2 text-primary hover:bg-primary/10 transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Client
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Clients", value: stats.totalClients, icon: Users },
            { label: "Active Agents", value: stats.activeClients, icon: Activity },
            { label: "Total Calls", value: stats.totalCalls, icon: Phone },
            { label: "Completed", value: stats.completedCalls, icon: Calendar },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="border border-border bg-card p-4">
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-xs uppercase tracking-widest">{label}</span>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="text-3xl font-bold text-foreground">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Client list */}
      <div className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Clients — {clients.length}</span>
          <button onClick={() => navigate("/admin/calls")} className="text-xs text-primary hover:text-primary/80 uppercase tracking-wider">
            Global Feed →
          </button>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm uppercase">Loading...</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm uppercase">No clients yet. Create your first one.</div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map(client => (
              <div key={client.id} className="p-4 flex items-center gap-4 hover:bg-secondary/10 transition-colors">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/admin/clients/${client.id}`)}>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm">{client.name}</span>
                    <Badge variant={client.isActive ? "default" : "secondary"} className="uppercase text-[10px]">
                      {client.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {client.businessType && <span className="text-xs text-muted-foreground">{client.businessType}</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{client.contactCount} contacts</span>
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.callCount} calls</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{client.bookingCount} bookings</span>
                    {client.phone && <span>{client.phone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { navigator.clipboard.writeText(portalUrl(client.accessToken)); toast({ title: "Client link copied!" }); }}
                    className="text-[10px] uppercase tracking-wider border border-border px-2 py-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex items-center gap-1"
                    title="Copy client portal link"
                  >
                    <ExternalLink className="w-3 h-3" /> Share
                  </button>
                  <button onClick={() => toggleMutation.mutate({ id: client.id, isActive: !client.isActive })} className="text-muted-foreground hover:text-primary transition-colors p-1" title={client.isActive ? "Deactivate" : "Activate"}>
                    {client.isActive ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => { if (confirm(`Delete ${client.name}?`)) deleteMutation.mutate(client.id); }} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create client modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="border-border bg-card font-mono">
          <DialogHeader><DialogTitle className="uppercase tracking-tight text-primary">New Client</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider">Client Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="bg-background border-border rounded-none font-mono" placeholder="Acme Corp" /></div>
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider">Business Type</Label><Input value={form.businessType} onChange={e => setForm(p => ({ ...p, businessType: e.target.value }))} className="bg-background border-border rounded-none font-mono" placeholder="Roofing, SaaS, Real Estate..." /></div>
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider">Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="bg-background border-border rounded-none font-mono" placeholder="+1 555 000 0000" /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} className="uppercase text-xs tracking-wider">Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} className="uppercase text-xs tracking-wider">{createMutation.isPending ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
