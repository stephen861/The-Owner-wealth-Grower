"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { id: string; from: "me" | "agent" | "staff"; body: string };

function newSessionId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

const GREETING: Msg = {
  id: "greet",
  from: "agent",
  body: "Hi! I'm FGW's leasing assistant. I can check available homes, see if you may qualify, and book a tour. How can I help? (¿Prefiere español? Solo escriba en español.)",
};

export default function ChatWidget() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: string | null = null;
    try {
      id = localStorage.getItem("fgw-chat-session");
      if (!id) {
        id = newSessionId();
        localStorage.setItem("fgw-chat-session", id);
      }
    } catch {
      id = newSessionId();
    }
    setSessionId(id);
  }, []);

  // Load history and poll for staff replies.
  useEffect(() => {
    if (!sessionId) return;
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/leasing/chat?sessionId=${sessionId}`);
        const j = (await r.json()) as { messages: Msg[] };
        if (!stop && j.messages.length) setMsgs([GREETING, ...j.messages]);
      } catch {}
    };
    load();
    const t = setInterval(() => !busy && load(), 15000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [sessionId, busy]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !sessionId || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: `local-${Date.now()}`, from: "me", body: text }]);
    setBusy(true);
    try {
      const r = await fetch("/api/leasing/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const j = (await r.json()) as { reply?: string | null };
      if (j.reply) setMsgs((m) => [...m, { id: `r-${Date.now()}`, from: "agent", body: j.reply! }]);
    } catch {
      setMsgs((m) => [...m, { id: `e-${Date.now()}`, from: "agent", body: "Sorry — connection problem. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", height: "70vh", padding: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.from === "me" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.from === "me" ? "var(--accent)" : "var(--panel-2)",
              color: m.from === "me" ? "#fff" : undefined,
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "8px 12px",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.from === "staff" ? <div className="subnote">FGW team member</div> : null}
            {m.body}
          </div>
        ))}
        {busy ? <div className="muted" style={{ fontSize: 13 }}>Typing…</div> : null}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message…"
          aria-label="Message"
          style={{ flex: 1 }}
          maxLength={2000}
        />
        <button className="btn" type="submit" disabled={busy || !sessionId}>Send</button>
      </form>
    </div>
  );
}
