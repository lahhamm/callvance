import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Phone, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getListCallsQueryKey, getListContactsQueryKey, getGetCallStatsQueryKey } from "@workspace/api-client-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  callInitiated?: boolean;
}

const SUGGESTIONS = [
  "Call Sarah Johnson about pricing",
  "Call +14155550101 and ask about their team",
  "Who was called most recently?",
];

async function sendChatMessage(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ message: string; callInitiated: boolean; call?: { id: number; phone: string; name?: string } }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export function ChatBox() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: 'NEXUS_VOICE online. Tell me who to call and what to discuss — e.g. "Call Marcus and ask about their budget."',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");

    const userMessage: Message = { role: "user", content: msg };
    const history = messages.filter((m) => m.role !== "assistant" || messages.indexOf(m) > 0);
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const result = await sendChatMessage(
        msg,
        [...history, userMessage].map((m) => ({ role: m.role, content: m.content }))
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.message,
          callInitiated: result.callInitiated,
        },
      ]);
      if (result.callInitiated) {
        queryClient.invalidateQueries({ queryKey: getListCallsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCallStatsQueryKey() });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Could not reach the server. Check your connection." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        data-testid="chat-toggle-button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          open && "rotate-0"
        )}
        aria-label="Toggle chat"
      >
        {open ? <ChevronDown className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </button>

      {/* Chat panel */}
      <div
        data-testid="chat-panel"
        className={cn(
          "fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl flex flex-col transition-all duration-200 origin-bottom-right",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        )}
        style={{ maxHeight: "520px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-bold uppercase tracking-widest text-primary font-mono">
              AI Command
            </span>
          </div>
          <button
            data-testid="chat-close-button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: "340px" }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              data-testid={`chat-message-${i}`}
              className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm font-mono leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground border border-border"
                )}
              >
                {msg.callInitiated && (
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs text-primary font-bold uppercase tracking-wider">
                    <Phone className="w-3 h-3" />
                    Call Initiated
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-secondary border border-border rounded-lg px-3 py-2 flex items-center gap-2 text-muted-foreground text-sm font-mono">
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions — only show when no user messages yet */}
        {messages.filter((m) => m.role === "user").length === 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                data-testid={`chat-suggestion-${s.slice(0, 20)}`}
                onClick={() => send(s)}
                className="text-xs font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors truncate max-w-full"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-border flex gap-2">
          <input
            ref={inputRef}
            data-testid="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Call Sarah about pricing..."
            disabled={loading}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 disabled:opacity-50 transition-colors"
          />
          <button
            data-testid="chat-send-button"
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 rounded-lg px-3 py-2 transition-colors flex items-center"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
