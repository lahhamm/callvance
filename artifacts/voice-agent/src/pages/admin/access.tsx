import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, RefreshCw, Shield, ShieldOff, Link as LinkIcon, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Client = {
  id: number; name: string; businessType: string; isActive: boolean;
  accessToken: string; portalPassword?: string | null;
};

function portalLink(token: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}link/${token}`.replace(/\/+/g, "/").replace(":/", "://");
}

function ClientRow({ client, onUpdated }: { client: Client; onUpdated: (c: Client) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const link = portalLink(client.accessToken);

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${client.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !client.isActive }) }),
    onSuccess: (data: Client) => { onUpdated(data); qc.invalidateQueries({ queryKey: ["admin-access"] }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const regenMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${client.id}/regenerate-token`, { method: "POST" }),
    onSuccess: (data: Client) => {
      onUpdated(data);
      qc.invalidateQueries({ queryKey: ["admin-access"] });
      setConfirmRegen(false);
      toast({ title: "New link generated", description: "The old link is now invalid." });
    },
    onError: () => toast({ title: "Failed to regenerate", variant: "destructive" }),
  });

  return (
    <div className={`p-5 transition-colors ${!client.isActive ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-4">
        {/* Icon + name */}
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          {client.isActive
            ? <Shield className="w-4 h-4 text-primary" />
            : <ShieldOff className="w-4 h-4 text-muted-foreground" />}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {/* Name + status */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-foreground text-sm">{client.name}</span>
            {client.businessType && (
              <span className="text-xs text-muted-foreground">{client.businessType}</span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
              client.isActive
                ? "bg-green-500/10 text-green-400 border-green-500/20"
                : "bg-secondary text-muted-foreground border-border"
            }`}>
              {client.isActive ? "Active" : "Disabled"}
            </span>
          </div>

          {/* Portal link */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-secondary/40 border border-border rounded-md px-3 py-2 min-w-0">
              <LinkIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <code className="text-xs text-muted-foreground truncate font-mono">{link}</code>
            </div>
            <button
              onClick={copyLink}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-secondary border border-border rounded-md hover:bg-secondary/80 hover:text-foreground text-muted-foreground transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Enable / Disable toggle */}
            <button
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                client.isActive
                  ? "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  : "border-primary/40 text-primary hover:bg-primary/10"
              }`}
            >
              {client.isActive ? <ShieldOff className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
              {toggleMutation.isPending ? "Saving…" : client.isActive ? "Disable access" : "Enable access"}
            </button>

            {/* Regenerate */}
            {confirmRegen ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400">Old link will stop working.</span>
                <button
                  onClick={() => regenMutation.mutate()}
                  disabled={regenMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
                >
                  {regenMutation.isPending ? "Regenerating…" : "Confirm regenerate"}
                </button>
                <button
                  onClick={() => setConfirmRegen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRegen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate link
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccessPage() {
  const qc = useQueryClient();
  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["admin-access"],
    queryFn: () => apiFetch("/admin/clients"),
  });

  const handleUpdated = (updated: Client) => {
    qc.setQueryData<Client[]>(["admin-access"], prev =>
      (prev ?? []).map(c => c.id === updated.id ? updated : c)
    );
  };

  const activeCount = clients.filter(c => c.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Client Access</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage portal links and access for each client. Share the link so they can log in directly.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-foreground">{clients.length}</div>
          <div className="text-xs text-muted-foreground mt-1 font-medium uppercase tracking-wider">Total clients</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-2xl font-bold text-green-400">{activeCount}</div>
          <div className="text-xs text-muted-foreground mt-1 font-medium uppercase tracking-wider">Active access</div>
        </div>
      </div>

      {/* Client list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground text-sm">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No clients yet. Add one from the Clients page.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map(client => (
              <ClientRow key={client.id} client={client} onUpdated={handleUpdated} />
            ))}
          </div>
        )}
      </div>

      {/* Help note */}
      <div className="bg-secondary/30 border border-border rounded-lg p-4 text-xs text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">How it works:</span> Each client gets a unique magic link.
        When they open it, they're automatically logged into their dashboard — no password needed.
        Disabling access blocks the link without deleting the client.
        Regenerating issues a new link and immediately invalidates the old one.
      </div>
    </div>
  );
}
