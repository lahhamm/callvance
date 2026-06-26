import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Phone, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authHeader } from "@/lib/auth";

interface Message {
  role: "user" | "assistant";
  content: string;
  callInitiated?: boolean;
}

type Client = { id: number; name: string };

const SUGGESTIONS = [
  "Call Sarah about pricing",
  "Call +14155550101 and ask about their timeline",
  "Who was called most recently?",
];

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...(init?.headers as Record<string, string> ?? {}) },
  }).then(r => r.json());
}

export function ChatBox() {
  const [open, setOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["admin-clients-light"],
    queryFn: () => apiFetch("/admin/clients"),
    select: (data) => data.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })),
  });

  // Auto-select first client when list loads
  useEffect(() => {
    if (clients.length > 0 && !selectedClientId) {
      setSelectedClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

  // Reset messages when client changes
  useEffect(() => {
    if (selectedClientId) {
      const clientName = clients.find(c => c.id === selectedClientId)?.name ?? "this client";
      setMessages([{
        role: "assistant",
        content: `Ready. Tell me who to call for ${clientName} — e.g. "Call Marcus and ask about their budget."`,
      }]);
    }
  }, [selectedClientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading || !selectedClientId) return;
    setInput("");

    const userMessage: Message = { role: "user", content: msg };
    const historyForApi = messages
      .filter((_, i) => i > 0)
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const result = await apiFetch("/admin/chat", {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedClientId,
          message: msg,
          history: [...historyForApi, { role: "user", content: msg }],
        }),
      });

      setMessages(prev => [...prev, {
        role: "assistant",
        content: result.message ?? result.error ?? "No response.",
        callInitiated: result.callInitiated,
      }]);

      if (result.callInitiated) {
        qc.invalidateQueries({ queryKey: ["admin-calls"] });
        qc.invalidateQueries({ queryKey: ["admin-contacts"] });
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Error: Could not reach the server.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200",
          "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
        )}
        aria-label="Toggle AI call assistant"
      >
        {open ? <ChevronDown className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </button>

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl flex flex-col transition-all duration-200 origin-bottom-right",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        )}
        style={{ maxHeight: "540px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-semibold text-foreground">AI Call Assistant</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Client selector */}
        <div className="px-4 py-2.5 border-b border-border shrink-0">
          <label className="text-xs text-muted-foreground block mb-1.5">Calling as client</label>
          <select
            value={selectedClientId ?? ""}
            onChange={e => setSelectedClientId(Number(e.target.value))}
            className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
          >
            {clients.length === 0 && <option value="">No clients yet</option>}
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground border border-border"
              )}>
                {msg.callInitiated && (
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs text-green-400 font-semibold">
                    <Phone className="w-3 h-3" />Call initiated
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-secondary border border-border rounded-lg px-3 py-2 flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-3 h-3 animate-spin" />Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions — only before first user message */}
        {messages.filter(m => m.role === "user").length === 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors truncate max-w-full"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-border flex gap-2 shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={selectedClientId ? "Who should we call?" : "Select a client first"}
            disabled={loading || !selectedClientId}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading || !selectedClientId}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 rounded-lg px-3 py-2 transition-colors flex items-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
