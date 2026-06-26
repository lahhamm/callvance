import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { authHeader } from "@/lib/auth";
import { ArrowLeft, Copy, Check, Plus, Phone, Trash2, Zap, FileText, Calendar, Users, Settings, Clock, RefreshCw, XCircle, ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Client = { id: number; name: string; businessType: string; phone: string; isActive: boolean; accessToken: string };
type Contact = { id: number; name: string; phone: string; email?: string; company?: string; status: string; lastCalledAt?: string };
type Call = { id: number; contactName?: string; contactPhone: string; status: string; summary?: string; keyInsights?: string; leadScore?: string; durationSeconds?: number; createdAt: string; transcript?: string };
type Booking = { id: number; contactName?: string; contactPhone?: string; scheduledAt: string; status: string; notes?: string };
type AgentConfig = { id: number; agentName: string; voice: string; prompt: string; firstMessage: string; maxDuration: number; qualificationCriteria?: string };
type Availability = { id: number; timezone: string; notificationEmail?: string; availableDays: number[]; startTime: string; endTime: string; slotDurationMinutes: number };

const VOICES = ["maya", "ryan", "adriana", "tina", "matt", "evelyn"];
const DAYS = [{ value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney"];
const TABS = ["Contacts", "Agent Config", "Calls", "Bookings", "Availability", "Share"] as const;

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeader(), ...(init?.headers as Record<string, string> ?? {}) } }).then(r => { if (!r.ok) throw new Error("API error"); return r.json(); });
}

function parseInsights(raw?: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return raw.split("\n").filter(Boolean); }
}

function scoreBadge(score?: string | null) {
  if (!score) return null;
  const s = score.toLowerCase();
  const map: Record<string, string> = { hot: "bg-red-500/20 text-red-400 border-red-500/30", warm: "bg-amber-500/20 text-amber-400 border-amber-500/30", cold: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
  return <span className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 font-mono ${map[s] ?? "bg-secondary text-muted-foreground"}`}>{score.toUpperCase()}</span>;
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
  const { data: calls = [] } = useQuery<Call[]>({ queryKey: ["admin-calls", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}/calls`) });
  const { data: bookings = [] } = useQuery<Booking[]>({ queryKey: ["admin-bookings", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}/bookings`) });
  const { data: config } = useQuery<AgentConfig>({ queryKey: ["admin-config", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}/config`) });
  const { data: avail } = useQuery<Availability>({ queryKey: ["admin-avail", clientId], queryFn: () => apiFetch(`/admin/clients/${clientId}/availability`) });

  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) => apiFetch(`/admin/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-client", clientId] }),
  });

  if (!client) return <div className="p-8 text-center text-muted-foreground font-mono uppercase text-sm">Loading...</div>;

  const portalUrl = `${window.location.origin}/client/${client.accessToken}`;

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate("/admin")} className="mt-1 text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-tight">{client.name}</h1>
            <Badge variant={client.isActive ? "default" : "secondary"} className="uppercase text-[10px]">{client.isActive ? "Active" : "Inactive"}</Badge>
            {client.businessType && <span className="text-sm text-muted-foreground">{client.businessType}</span>}
            <button onClick={() => toggleMutation.mutate(!client.isActive)} className="text-muted-foreground hover:text-primary transition-colors">
              {client.isActive ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
          </div>
          {client.phone && <p className="text-sm text-muted-foreground mt-1">{client.phone}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex gap-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs uppercase tracking-wider border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Contacts" && <ContactsTab clientId={clientId} contacts={contacts} qc={qc} toast={toast} />}
      {tab === "Agent Config" && config && <ConfigTab clientId={clientId} config={config} qc={qc} toast={toast} />}
      {tab === "Calls" && <CallsTab calls={calls} onTranscript={setTranscript} />}
      {tab === "Bookings" && <BookingsTab clientId={clientId} bookings={bookings} qc={qc} toast={toast} />}
      {tab === "Availability" && avail && <AvailabilityTab clientId={clientId} avail={avail} qc={qc} toast={toast} />}
      {tab === "Share" && <ShareTab portalUrl={portalUrl} toast={toast} />}

      {/* Transcript modal */}
      <Dialog open={!!transcript} onOpenChange={o => !o && setTranscript(null)}>
        <DialogContent className="border-border bg-card max-w-2xl max-h-[80vh] flex flex-col font-mono">
          <DialogHeader className="border-b border-border pb-4"><DialogTitle className="uppercase tracking-tight text-primary text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Transcript</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {transcript?.split("\n").map((line, i) => { if (!line.trim()) return null; const isAgent = /^(agent|ai|aria):/i.test(line); return <div key={i} className={`p-2 border-l-2 leading-relaxed ${isAgent ? "bg-primary/5 border-primary" : "bg-secondary/30 border-muted-foreground/50 text-muted-foreground"}`}>{line}</div>; })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactsTab({ clientId, contacts, qc, toast }: { clientId: number; contacts: Contact[]; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>["toast"] }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "" });
  const [show, setShow] = useState(false);
  const createMutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}/contacts`, { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-contacts", clientId] }); setShow(false); setForm({ name: "", phone: "", email: "", company: "" }); toast({ title: "Contact added" }); },
  });
  const callMutation = useMutation({
    mutationFn: (contactId: number) => apiFetch(`/admin/clients/${clientId}/calls/initiate`, { method: "POST", body: JSON.stringify({ contactId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-calls", clientId] }); toast({ title: "Call initiated" }); },
  });
  const deleteMutation = useMutation({
    mutationFn: (contactId: number) => apiFetch(`/admin/clients/${clientId}/contacts/${contactId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-contacts", clientId] }),
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setShow(true)} className="flex items-center gap-2 text-xs uppercase tracking-wider border border-primary/40 px-3 py-2 text-primary hover:bg-primary/10 transition-colors"><Plus className="w-3.5 h-3.5" />Add Contact</button></div>
      <div className="border border-border bg-card divide-y divide-border">
        {contacts.length === 0 ? <div className="p-6 text-center text-muted-foreground text-sm uppercase">No contacts yet</div> : contacts.map(c => (
          <div key={c.id} className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className="font-bold text-sm">{c.name}</span><Badge variant="secondary" className="text-[10px] uppercase">{c.status}</Badge></div>
              <div className="text-xs text-muted-foreground">{c.phone}{c.company ? ` · ${c.company}` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => callMutation.mutate(c.id)} className="text-[10px] uppercase tracking-wider border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"><Phone className="w-3 h-3" />Call</button>
              <button onClick={() => deleteMutation.mutate(c.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="border-border bg-card font-mono">
          <DialogHeader><DialogTitle className="uppercase tracking-tight text-primary text-sm">Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {[["Name *", "name", "Jane Smith"], ["Phone *", "phone", "+1 555 000 0000"], ["Email", "email", "jane@company.com"], ["Company", "company", "Acme Corp"]].map(([label, key, placeholder]) => (
              <div key={key} className="space-y-1"><Label className="text-xs uppercase tracking-wider">{label}</Label><Input value={(form as Record<string, string>)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="bg-background border-border rounded-none font-mono text-sm" placeholder={placeholder} /></div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShow(false)} className="text-xs uppercase tracking-wider">Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.name || !form.phone} className="text-xs uppercase tracking-wider">{createMutation.isPending ? "Adding..." : "Add"}</Button>
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
    <div className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Agent Name</Label><Input value={form.agentName} onChange={e => setForm(p => ({ ...p, agentName: e.target.value }))} className="bg-background border-border rounded-none font-mono text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Voice</Label>
          <Select value={form.voice} onValueChange={v => setForm(p => ({ ...p, voice: v }))}>
            <SelectTrigger className="bg-background border-border rounded-none font-mono text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border rounded-none">{VOICES.map(v => <SelectItem key={v} value={v} className="font-mono text-xs capitalize">{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">First Message</Label><Input value={form.firstMessage} onChange={e => setForm(p => ({ ...p, firstMessage: e.target.value }))} className="bg-background border-border rounded-none font-mono text-sm" /></div>
      <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">System Prompt</Label><Textarea value={form.prompt} onChange={e => setForm(p => ({ ...p, prompt: e.target.value }))} className="min-h-[150px] bg-background border-border rounded-none font-mono text-sm" /></div>
      <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Qualification Criteria</Label><Textarea value={form.qualificationCriteria} onChange={e => setForm(p => ({ ...p, qualificationCriteria: e.target.value }))} placeholder="e.g. Must have budget > $5k, need a demo within 30 days, homeowner..." className="min-h-[80px] bg-background border-border rounded-none font-mono text-sm" /></div>
      <div className="space-y-1.5 max-w-[160px]"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Max Duration (s)</Label><Input type="number" value={form.maxDuration} onChange={e => setForm(p => ({ ...p, maxDuration: Number(e.target.value) }))} className="bg-background border-border rounded-none font-mono text-sm" /></div>
      <div className="flex justify-end pt-2 border-t border-border"><Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="text-xs uppercase tracking-wider">{mutation.isPending ? "Saving..." : "Save Config"}</Button></div>
    </div>
  );
}

function CallsTab({ calls, onTranscript }: { calls: Call[]; onTranscript: (t: string) => void }) {
  return (
    <div className="border border-border bg-card divide-y divide-border">
      {calls.length === 0 ? <div className="p-6 text-center text-muted-foreground text-sm uppercase">No calls yet</div> : calls.map(c => {
        const insights = parseInsights(c.keyInsights);
        return (
          <div key={c.id} className="p-4 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-sm">{c.contactName || c.contactPhone}</span>
              <Badge variant={c.status === "completed" ? "default" : c.status === "failed" ? "destructive" : "secondary"} className="text-[10px] uppercase">{c.status}</Badge>
              {scoreBadge(c.leadScore)}
              <span className="text-xs text-muted-foreground ml-auto">{new Date(c.createdAt).toLocaleString()}</span>
              {c.durationSeconds && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{c.durationSeconds}s</span>}
              {c.transcript && <button onClick={() => onTranscript(c.transcript!)} className="text-[10px] uppercase tracking-wider border border-primary/30 px-2 py-1 text-primary hover:bg-primary/10 flex items-center gap-1"><FileText className="w-3 h-3" />Transcript</button>}
            </div>
            {c.summary && <p className="text-xs text-muted-foreground leading-relaxed">{c.summary}</p>}
            {insights.length > 0 && <div className="flex flex-wrap gap-1.5">{insights.map((ins, i) => <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider"><Zap className="w-2.5 h-2.5" />{ins}</span>)}</div>}
          </div>
        );
      })}
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
    <div className="space-y-4">
      {[{ label: "Upcoming", items: upcoming }, { label: "Past & Cancelled", items: past }].map(({ label, items }) => (
        <div key={label}>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{label} — {items.length}</div>
          <div className="border border-border bg-card divide-y divide-border">
            {items.length === 0 ? <div className="p-4 text-center text-muted-foreground text-sm">None</div> : items.map(b => (
              <div key={b.id} className={`p-3 flex items-center gap-3 ${label === "Past & Cancelled" ? "opacity-60" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-bold text-sm">{b.contactName || "Unknown"}</span><Badge variant={b.status === "confirmed" ? "default" : "destructive"} className="text-[10px] uppercase">{b.status}</Badge></div>
                  <div className="text-xs text-primary mt-0.5">{new Date(b.scheduledAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                  {b.notes && <div className="text-xs text-muted-foreground mt-0.5">{b.notes}</div>}
                </div>
                {b.status === "confirmed" && new Date(b.scheduledAt) > new Date() && (
                  <button onClick={() => cancelMutation.mutate(b.id)} className="text-[10px] uppercase tracking-wider border border-destructive/30 px-2 py-1 text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1"><XCircle className="w-3 h-3" />Cancel</button>
                )}
              </div>
            ))}
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
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/admin/clients/${clientId}/availability`, { method: "PUT", body: JSON.stringify({ timezone: tz, notificationEmail: email || null, availableDays: selectedDays, startTime: start, endTime: end, slotDurationMinutes: slot }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-avail", clientId] }); toast({ title: "Availability saved" }); },
  });
  const toggle = (d: number) => setSelectedDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort());
  return (
    <div className="space-y-4 max-w-xl">
      <div className="space-y-2"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Available Days</Label><div className="flex gap-2 flex-wrap">{DAYS.map(d => <button key={d.value} type="button" onClick={() => toggle(d.value)} className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition-colors ${selectedDays.includes(d.value) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>{d.label}</button>)}</div></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Time</Label><Input type="time" value={start} onChange={e => setStart(e.target.value)} className="bg-background border-border rounded-none font-mono" /></div>
        <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">End Time</Label><Input type="time" value={end} onChange={e => setEnd(e.target.value)} className="bg-background border-border rounded-none font-mono" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Timezone</Label>
          <Select value={tz} onValueChange={setTz}><SelectTrigger className="bg-background border-border rounded-none font-mono text-sm"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-border rounded-none">{TIMEZONES.map(t => <SelectItem key={t} value={t} className="text-xs font-mono">{t}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Slot (min)</Label>
          <Select value={String(slot)} onValueChange={v => setSlot(Number(v))}><SelectTrigger className="bg-background border-border rounded-none font-mono text-sm"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-border rounded-none">{[15, 20, 30, 45, 60].map(m => <SelectItem key={m} value={String(m)} className="text-xs font-mono">{m} min</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Notification Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="bg-background border-border rounded-none font-mono" placeholder="you@company.com" /></div>
      <div className="flex justify-end pt-2 border-t border-border"><Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="text-xs uppercase tracking-wider">{mutation.isPending ? "Saving..." : "Save Availability"}</Button></div>
    </div>
  );
}

function ShareTab({ portalUrl, toast }: { portalUrl: string; toast: ReturnType<typeof useToast>["toast"] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(portalUrl); setCopied(true); toast({ title: "Link copied!" }); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="max-w-lg space-y-4">
      <div className="border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Client Portal Link</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">Share this unique URL with your client. They can view their call log and upcoming appointments — no login required.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={portalUrl} className="flex-1 bg-background border border-border px-3 py-2 text-xs font-mono text-muted-foreground focus:outline-none" />
          <button onClick={copy} className="flex items-center gap-1.5 border border-primary/40 px-3 py-2 text-xs uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors shrink-0">
            {copied ? <><Check className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
          </button>
        </div>
        <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">Open portal →</a>
      </div>
    </div>
  );
}
