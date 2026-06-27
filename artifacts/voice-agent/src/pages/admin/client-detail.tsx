import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft, Copy, Check, Plus, Phone, Trash2, Zap,
  FileText, Clock, XCircle, Eye, EyeOff, KeyRound, RefreshCw, CalendarDays
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Client = { id: number; name: string; businessType: string; phone: string; isActive: boolean; accessToken: string; portalPassword?: string; calUsername?: string; calEventId?: string };
type Contact = { id: number; name: string; phone: string; email?: string; company?: string; status: string; lastCalledAt?: string };
type Call = { id: number; contactName?: string; contactPhone: string; status: string; summary?: string; keyInsights?: string; leadScore?: string; durationSeconds?: number; createdAt: string; transcript?: string };
type Booking = { id: number; contactName?: string; contactPhone?: string; scheduledAt: string; status: string; notes?: string; timezone?: string | null };

function formatInTz(iso: string, timezone?: string | null) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = new Date(iso).toLocaleString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const abbr = new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop() ?? "";
  return `${time} ${abbr}`;
}
type AgentConfig = { id: number; agentName: string; voice: string; prompt: string; firstMessage: string; maxDuration: number; qualificationCriteria?: string };
type Availability = { id: number; timezone: string; notificationEmail?: string; notificationPhone?: string; availableDays: number[]; startTime: string; endTime: string; slotDurationMinutes: number; preventOverlaps: boolean };

const VOICES = ["maya", "ryan", "adriana", "tina", "matt", "evelyn"];
const DAYS = [{ value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney"];
const TABS = ["Contacts", "Agent Configuration", "Calls", "Bookings", "Schedule", "Access"] as const;


function parseInsights(raw?: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return raw.split("\n").filter(Boolean); }
}

function ScoreBadge({ score }: { score?: string | null }) {
  if (!score) return null;
  const s = score.toLowerCase();
  const styles: Record<string, string> = {
    hot: "bg-green-500/10 text-green-400 border-green-500/20",
    warm: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cold: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[s] ?? "bg-secondary text-muted-foreground"}`}>{score}</span>;
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<typeof TABS[number]>("Contacts");
  const [transcript, setTranscript] = useState<string | null>(null);

  const { data: client } = useQuery<Client>({ queryKey: ["admin-client", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}`) });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["admin-contacts", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}/contacts`) });
  const { data: calls = [] } = useQuery<Call[]>({
    queryKey: ["admin-calls", clientId],
    queryFn: () => apiFetch(`/admin/clients/${clientId}/calls`),
    refetchInterval: (query) => {
      const data = query.state.data as Call[] | undefined;
      const hasInProgress = data?.some(c => c.status === "in-progress" || c.status === "queued");
      return hasInProgress ? 5_000 : 30_000;
    },
  });
  const { data: bookings = [] } = useQuery<Booking[]>({ queryKey: ["admin-bookings", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}/bookings`) });
  const { data: config } = useQuery<AgentConfig>({ queryKey: ["admin-config", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}/config`) });
  const { data: avail, isLoading: availLoading, isError: availError } = useQuery<Availability>({ queryKey: ["admin-avail", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}/availability`) });

  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) => apiFetch(`/admin/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-client", clientId] }),
  });

  if (!client) return <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate("/admin")} className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">{client.name}</h1>
            <Badge variant={client.isActive ? "default" : "secondary"}>
              {client.isActive ? "Active" : "Paused"}
            </Badge>
            {client.businessType && <span className="text-sm text-muted-foreground">{client.businessType}</span>}
          </div>
          <div className="flex items-center gap-4 mt-1.5">
            {client.phone && <span className="text-sm text-muted-foreground">{client.phone}</span>}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Active</span>
              <Switch checked={client.isActive} onCheckedChange={v => toggleMutation.mutate(v)} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex flex-wrap gap-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Contacts" && <ContactsTab clientId={clientId} contacts={contacts} calls={calls} qc={qc} toast={toast} />}
      {tab === "Agent Configuration" && config && <ConfigTab clientId={clientId} config={config} qc={qc} toast={toast} />}
      {tab === "Calls" && <CallsTab clientId={clientId} calls={calls} onTranscript={setTranscript} qc={qc} toast={toast} />}
      {tab === "Bookings" && <BookingsTab clientId={clientId} bookings={bookings} qc={qc} toast={toast} />}
      {tab === "Schedule" && (
        availLoading ? <div className="p-8 text-center text-muted-foreground text-sm">Loading schedule…</div>
        : availError ? <div className="p-8 text-center text-destructive text-sm">Failed to load schedule settings. Please refresh the page.</div>
        : avail ? <AvailabilityTab clientId={clientId} avail={avail} qc={qc} toast={toast} />
        : <div className="p-8 text-center text-muted-foreground text-sm">No schedule data found.</div>
      )}
      {tab === "Access" && client && <AccessTab clientId={clientId} client={client} qc={qc} toast={toast} />}

      {/* Transcript */}
      <Dialog open={!!transcript} onOpenChange={o => !o && setTranscript(null)}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-sm font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Transcript</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs font-mono">
            {transcript?.split("\n").map((line, i) => {
              if (!line.trim()) return null;
              const isAgent = /^(agent|ai|aria|callvance):/i.test(line);
              return <div key={i} className={`p-2.5 rounded-md leading-relaxed ${isAgent ? "bg-primary/10 text-primary border border-primary/20" : "bg-secondary/50 text-muted-foreground"}`}>{line}</div>;
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactsTab({ clientId, contacts, calls, qc, toast }: { clientId: number; contacts: Contact[]; calls: Call[]; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "" });
  const [show, setShow] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  const hasInProgress = calls.some(c => c.status === "in-progress" || c.status === "queued");

  const createMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}/contacts`, { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-contacts", clientId] }); setShow(false); setForm({ name: "", phone: "", email: "", company: "" }); toast({ title: "Contact added" }); },
  });
  const callMutation = useMutation({
    mutationFn: (contactId: number) => apiFetch(`/admin/clients/${clientId}/calls/initiate`, { method: "POST", body: JSON.stringify({ contactId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-calls", clientId] }); toast({ title: "Call initiated" }); },
    onError: (err) => { toast({ title: "Call failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }); },
  });
  const deleteMutation = useMutation({
    mutationFn: (contactId: number) => apiFetch(`/admin/clients/${clientId}/contacts/${contactId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-contacts", clientId] }),
  });
  const bulkCallMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}/calls/bulk`, { method: "POST", body: JSON.stringify({ contactIds: contacts.map(c => c.id) }) }),
    onSuccess: (data: { succeeded: number; failed: number }) => {
      qc.invalidateQueries({ queryKey: ["admin-calls", clientId] });
      qc.invalidateQueries({ queryKey: ["admin-contacts", clientId] });
      setShowBulkDialog(false);
      toast({ title: `Calls initiated: ${data.succeeded} succeeded, ${data.failed} failed` });
    },
    onError: () => { setShowBulkDialog(false); toast({ title: "Bulk call failed", variant: "destructive" }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {contacts.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setShowBulkDialog(true)} disabled={hasInProgress || bulkCallMutation.isPending} className="gap-1.5 h-8 text-xs">
            <Zap className="w-3 h-3" />{bulkCallMutation.isPending ? "Calling…" : "Call All"}
          </Button>
        )}
        <Button size="sm" onClick={() => setShow(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Add contact</Button>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
        {contacts.length === 0
          ? <div className="p-8 text-center text-muted-foreground text-sm">No contacts yet</div>
          : contacts.map(c => (
            <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-secondary/20 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{c.name}</span>
                  <Badge variant="secondary" className="text-xs">{c.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono">{c.phone}{c.company ? ` · ${c.company}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => callMutation.mutate(c.id)} className="gap-1.5 h-7 text-xs"><Phone className="w-3 h-3" />Call</Button>
                <button onClick={() => deleteMutation.mutate(c.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))
        }
      </div>
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Call All Contacts</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will initiate calls to all <span className="font-semibold text-foreground">{contacts.length}</span> contact{contacts.length !== 1 ? "s" : ""}. Are you sure?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>Cancel</Button>
            <Button onClick={() => bulkCallMutation.mutate()} disabled={bulkCallMutation.isPending}>
              {bulkCallMutation.isPending ? "Calling…" : `Call ${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {[["Name *", "name", "Jane Smith", "text"], ["Phone *", "phone", "+1 555 000 0000", "tel"], ["Email", "email", "jane@company.com", "email"], ["Company", "company", "Acme Corp", "text"]].map(([label, key, placeholder, type]) => (
              <div key={key} className="space-y-1.5"><Label className="text-sm font-medium">{label}</Label><Input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="bg-background border-border" placeholder={placeholder} /></div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShow(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || !form.phone}>{createMutation.isPending ? "Adding…" : "Add contact"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfigTab({ clientId, config, qc, toast }: { clientId: number; config: AgentConfig; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const [form, setForm] = useState({ agentName: config.agentName, voice: config.voice, prompt: config.prompt, firstMessage: config.firstMessage, maxDuration: config.maxDuration, qualificationCriteria: config.qualificationCriteria ?? "" });
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}/config`, { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-config", clientId] }); toast({ title: "Config saved" }); },
  });
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label className="text-sm font-medium">Agent name</Label><Input value={form.agentName} onChange={e => setForm(p => ({ ...p, agentName: e.target.value }))} className="bg-background border-border" /></div>
        <div className="space-y-1.5"><Label className="text-sm font-medium">Voice</Label>
          <Select value={form.voice} onValueChange={v => setForm(p => ({ ...p, voice: v }))}>
            <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">{VOICES.map(v => <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-sm font-medium">Opening message</Label><Input value={form.firstMessage} onChange={e => setForm(p => ({ ...p, firstMessage: e.target.value }))} className="bg-background border-border" /></div>
      <div className="space-y-1.5"><Label className="text-sm font-medium">System prompt</Label><Textarea value={form.prompt} onChange={e => setForm(p => ({ ...p, prompt: e.target.value }))} className="min-h-[140px] bg-background border-border text-sm" /></div>
      <div className="space-y-1.5"><Label className="text-sm font-medium">Qualification criteria <span className="text-muted-foreground font-normal">(optional)</span></Label><Textarea value={form.qualificationCriteria} onChange={e => setForm(p => ({ ...p, qualificationCriteria: e.target.value }))} placeholder="e.g. Must have budget > $5k, homeowner, decision maker…" className="min-h-[80px] bg-background border-border text-sm" /></div>
      <div className="space-y-1.5 max-w-[140px]"><Label className="text-sm font-medium">Max duration (s)</Label><Input type="number" value={form.maxDuration} onChange={e => setForm(p => ({ ...p, maxDuration: Number(e.target.value) }))} className="bg-background border-border" /></div>
      <div className="flex justify-end pt-2 border-t border-border"><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save config"}</Button></div>
    </div>
  );
}

function CallsTab({ clientId, calls, onTranscript, qc, toast }: { clientId: number; calls: Call[]; onTranscript: (t: string) => void; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const hasInProgress = calls.some(c => c.status === "in-progress" || c.status === "queued");

  const syncMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}/calls/sync`, { method: "POST" }),
    onSuccess: (data: { synced: number; checked: number }) => {
      qc.invalidateQueries({ queryKey: ["admin-calls", clientId] });
      qc.invalidateQueries({ queryKey: ["admin-bookings", clientId] });
      if (data.synced > 0) toast({ title: `Synced ${data.synced} call${data.synced > 1 ? "s" : ""} from BlandAI` });
      else toast({ title: "All calls up to date" });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  // Auto-sync on mount if any calls are stuck in-progress
  useEffect(() => {
    if (hasInProgress && !syncMutation.isPending) {
      syncMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{calls.length} call{calls.length !== 1 ? "s" : ""}</span>
        <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-1.5 h-7 text-xs">
          <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing…" : "Sync with BlandAI"}
        </Button>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
        {calls.length === 0
          ? <div className="p-8 text-center text-muted-foreground text-sm">No calls yet</div>
          : calls.map(c => {
            const insights = parseInsights(c.keyInsights);
            return (
              <div key={c.id} className="p-4 space-y-2 hover:bg-secondary/20 transition-colors">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-medium text-sm text-foreground">{c.contactName || c.contactPhone}</span>
                  <Badge variant={c.status === "completed" ? "default" : c.status === "failed" ? "destructive" : "secondary"} className="text-xs">{c.status}</Badge>
                  <ScoreBadge score={c.leadScore} />
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(c.createdAt).toLocaleString()}</span>
                  {c.durationSeconds && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{c.durationSeconds}s</span>}
                  {c.transcript && <button onClick={() => onTranscript(c.transcript!)} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"><FileText className="w-3 h-3" />Transcript</button>}
                </div>
                {c.summary && <p className="text-sm text-muted-foreground leading-relaxed">{c.summary}</p>}
                {insights.length > 0 && <div className="flex flex-wrap gap-1.5">{insights.map((ins, i) => <span key={i} className="text-xs px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full">{ins}</span>)}</div>}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function BookingsTab({ clientId, bookings, qc, toast }: { clientId: number; bookings: Booking[]; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/clients/${clientId}/bookings/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-bookings", clientId] }); toast({ title: "Booking cancelled" }); },
  });
  const upcoming = bookings.filter(b => b.status === "confirmed" && new Date(b.scheduledAt) > new Date());
  const past = bookings.filter(b => b.status !== "confirmed" || new Date(b.scheduledAt) <= new Date());
  return (
    <div className="space-y-5">
      {[{ label: "Upcoming", items: upcoming }, { label: "Past & cancelled", items: past }].map(({ label, items }) => (
        <div key={label}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">{label}</h3>
          <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
            {items.length === 0
              ? <div className="p-5 text-center text-muted-foreground text-sm">None</div>
              : items.map(b => (
                <div key={b.id} className={`px-4 py-3 flex items-center gap-3 ${label !== "Upcoming" ? "opacity-60" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="font-medium text-sm">{b.contactName || "Unknown"}</span><Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs">{b.status}</Badge></div>
                    <div className="text-xs text-primary mt-0.5">{formatInTz(b.scheduledAt, b.timezone)}</div>
                    {b.notes && <div className="text-xs text-muted-foreground mt-0.5">{b.notes}</div>}
                  </div>
                  {b.status === "confirmed" && new Date(b.scheduledAt) > new Date() && (
                    <Button size="sm" variant="destructive" onClick={() => cancelMutation.mutate(b.id)} className="gap-1.5 h-7 text-xs"><XCircle className="w-3 h-3" />Cancel</Button>
                  )}
                </div>
              ))
            }
          </div>
        </div>
      ))}
    </div>
  );
}

function AvailabilityTab({ clientId, avail, qc, toast }: { clientId: number; avail: Availability; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const [selectedDays, setSelectedDays] = useState(avail.availableDays);
  const [tz, setTz] = useState(avail.timezone);
  const [start, setStart] = useState(avail.startTime);
  const [end, setEnd] = useState(avail.endTime);
  const [slot, setSlot] = useState(avail.slotDurationMinutes);
  const [email, setEmail] = useState(avail.notificationEmail ?? "");
  const [phone, setPhone] = useState(avail.notificationPhone ?? "");
  const [preventOverlaps, setPreventOverlaps] = useState(avail.preventOverlaps);
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}/availability`, { method: "PUT", body: JSON.stringify({ timezone: tz, notificationEmail: email || null, notificationPhone: phone || null, availableDays: selectedDays, startTime: start, endTime: end, slotDurationMinutes: slot, preventOverlaps }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-avail", clientId] }); toast({ title: "Availability saved" }); },
  });
  const toggle = (d: number) => setSelectedDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort());
  return (
    <div className="space-y-5 max-w-xl">
      <div className="space-y-2"><Label className="text-sm font-medium">Available days</Label><div className="flex gap-2 flex-wrap">{DAYS.map(d => <button key={d.value} type="button" onClick={() => toggle(d.value)} className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${selectedDays.includes(d.value) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>{d.label}</button>)}</div></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label className="text-sm font-medium">Start time</Label><Input type="time" value={start} onChange={e => setStart(e.target.value)} className="bg-background border-border" /></div>
        <div className="space-y-1.5"><Label className="text-sm font-medium">End time</Label><Input type="time" value={end} onChange={e => setEnd(e.target.value)} className="bg-background border-border" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label className="text-sm font-medium">Timezone</Label>
          <Select value={tz} onValueChange={setTz}><SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-border">{TIMEZONES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label className="text-sm font-medium">Slot duration</Label>
          <Select value={String(slot)} onValueChange={v => setSlot(Number(v))}><SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-border">{[15, 20, 30, 45, 60].map(m => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-sm font-medium">Notification email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="bg-background border-border" placeholder="you@company.com" /></div>
      <div className="space-y-1.5"><Label className="text-sm font-medium">Notification SMS</Label><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="bg-background border-border" placeholder="+14155552671" /></div>
      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Prevent appointment overlaps</p>
          <p className="text-xs text-muted-foreground mt-0.5">When enabled, the AI agent will only offer available time slots based on existing bookings.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={preventOverlaps}
          onClick={() => setPreventOverlaps(p => !p)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${preventOverlaps ? "bg-primary" : "bg-secondary"}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${preventOverlaps ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      <div className="flex justify-end pt-2 border-t border-border"><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save availability"}</Button></div>
    </div>
  );
}

function AccessTab({ clientId, client, qc, toast }: { clientId: number; client: Client; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const [password, setPassword] = useState(client.portalPassword ?? "");
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [calUsername, setCalUsername] = useState(client.calUsername ?? "");
  const [calEventId, setCalEventId] = useState(client.calEventId ?? "");

  const pwMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ portalPassword: password }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-client", clientId] }); toast({ title: "Password saved" }); },
  });

  const calMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ calUsername: calUsername.trim(), calEventId: calEventId.trim() }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-client", clientId] }); toast({ title: "Cal.com settings saved" }); },
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: `${label} copied` });
    setTimeout(() => setCopied(false), 2000);
  };

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    const pw = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setPassword(pw);
  };

  return (
    <div className="max-w-lg space-y-6">
      {/* Client portal password */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Client portal password</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Set a password for this client to log in at <span className="font-mono text-foreground">{window.location.origin}/login</span>. They'll be taken directly to their dashboard — no URL token needed.
        </p>
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter or generate a password"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all pr-9"
              />
              <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={generatePassword} className="gap-1.5 shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />Generate
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => pwMutation.mutate()} disabled={!password || pwMutation.isPending} className="flex-1">
              {pwMutation.isPending ? "Saving…" : "Save password"}
            </Button>
            {password && (
              <Button variant="outline" onClick={() => copy(password, "Password")} className="gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Login instructions */}
      <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-2">
        <p className="text-xs font-medium text-foreground">Share with client</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Send your client the login URL and their password. They'll log in and land directly on their dashboard.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <code className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-xs font-mono text-muted-foreground">
            {window.location.origin}/login
          </code>
          <Button variant="outline" size="sm" onClick={() => copy(`${window.location.origin}/login`, "Login URL")} className="gap-1.5 shrink-0">
            <Copy className="w-3.5 h-3.5" />Copy
          </Button>
        </div>
      </div>

      {/* Cal.com embed config */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Cal.com booking embed</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The client's Appointments tab will show an inline Cal.com booking widget. Enter the Cal.com username and event type slug for this client.
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Cal.com username</Label>
            <Input
              value={calUsername}
              onChange={e => setCalUsername(e.target.value)}
              placeholder="e.g. john-smith"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Event type slug</Label>
            <Input
              value={calEventId}
              onChange={e => setCalEventId(e.target.value)}
              placeholder="e.g. 30min or consultation"
              className="font-mono text-sm"
            />
          </div>
          {calUsername && calEventId && (
            <p className="text-xs text-muted-foreground font-mono bg-secondary/40 rounded px-2.5 py-1.5">
              {calUsername}/{calEventId}
            </p>
          )}
          <Button onClick={() => calMutation.mutate()} disabled={calMutation.isPending} className="w-full">
            {calMutation.isPending ? "Saving…" : "Save Cal.com settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
