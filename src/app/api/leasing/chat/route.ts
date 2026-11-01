// Public web-chat endpoint used by /chat (and embeddable on any FGW site).
import { prisma } from "@/lib/prisma";
import { handleInbound } from "@/lib/leasing/agent";

export const dynamic = "force-dynamic";

const validSession = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(s);

export async function POST(req: Request) {
  const data = (await req.json().catch(() => null)) as { sessionId?: unknown; message?: unknown } | null;
  const sessionId = data?.sessionId;
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  if (!validSession(sessionId) || !message) {
    return Response.json({ error: "sessionId and message required" }, { status: 400 });
  }
  const prospect = await prisma.prospect.upsert({
    where: { webSessionId: sessionId },
    update: {},
    create: { webSessionId: sessionId, source: "WEB" },
  });
  const { reply } = await handleInbound(prospect.id, "WEB", message);
  return Response.json({ reply });
}

// Poll for the thread (picks up staff replies after a handoff).
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!validSession(sessionId)) return Response.json({ messages: [] });
  const prospect = await prisma.prospect.findUnique({
    where: { webSessionId: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
  return Response.json({
    messages: (prospect?.messages ?? [])
      .filter((m) => m.author !== "SYSTEM")
      .map((m) => ({ id: m.id, from: m.direction === "IN" ? "me" : m.author === "STAFF" ? "staff" : "agent", body: m.body })),
  });
}
