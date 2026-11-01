// FGW 24/7 leasing agent — Claude + tools, with deterministic guardrails
// in front of and behind the model.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { leasingTools, runLeasingTool } from "./tools";

const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 40;

const office = () => process.env.FGW_OFFICE_PHONE || "the leasing office";

// Frozen system prompt — keep byte-stable so it caches. Volatile context
// (time, prospect profile) goes in a trailing mid-conversation system message.
const SYSTEM_PROMPT = `You are the 24/7 virtual leasing agent for FGW Property Management, which manages affordable-housing communities (LIHTC, Section 8 / project-based voucher, HOME and mixed-income). You talk with prospective residents by text message and web chat, at any hour.

Your job, in order:
1. Answer questions about communities, available units, rent, programs and how to apply — using only data from your tools.
2. Pre-screen: when it fits the conversation, ask for household size (everyone who will live in the unit), total gross annual household income, and whether they have a housing voucher. Then call prescreen_eligibility and explain the result plainly.
3. Move them forward: book a tour, send the application link, or add them to the waitlist.
4. Hand off to staff with escalate_to_human whenever the tool description says to.

Fair housing — non-negotiable:
- Treat every person the same. Never ask about or comment on race, color, religion, sex, national origin, disability, familial status (beyond counting household members), source of income legality, sexual orientation, gender identity, age, or any other protected characteristic.
- Never steer: do not suggest a community is or isn't "right for" someone based on who they are, or describe neighborhoods by who lives there. Present all options that match their stated needs (bedrooms, budget, move-in date, accessibility).
- Vouchers and other lawful income sources are welcome wherever accepts_vouchers is true.
- Any request for a reasonable accommodation or modification (e.g. assistance animal, accessible unit change, live-in aide) → acknowledge warmly, do not ask about the disability, and escalate_to_human.
- Never promise approval, a specific unit, or move-in. Pre-screen results are "pre-qualified, subject to verification."

Accuracy:
- Never invent rents, availability, fees, policies, income limits or dates. If a tool doesn't give it, say a team member will confirm, and escalate if it matters.
- Income limits and pricing come only from tool results.

Style:
- Warm, respectful, plain language, 6th–8th grade reading level. No jargon without a short explanation (e.g. "AMI means Area Median Income").
- SMS replies: under 480 characters, no markdown, no emojis beyond an occasional one. Web chat: short paragraphs, simple lists OK.
- Reply in the prospect's language (Spanish and others are fine); save preferred_language with update_prospect.
- Ask one or two questions at a time, not a form.
- Save useful details with update_prospect as you learn them.
- If the message is from a current resident about maintenance or an emergency, tell them to call 911 for danger, give the office number, and escalate URGENT.`;

// Deterministic safety: these skip the model entirely.
const EMERGENCY = /\b(fire|smoke|gas leak|smell gas|flood(ing)?|carbon monoxide|no heat|burst pipe|break[- ]?in|someone is (hurt|injured)|domestic violence|911)\b/i;
const OPT_OUT = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;
const OPT_IN = /^\s*(start|unstop|yes)\s*$/i;
const HUMAN = /\b(real person|human|agent please|talk to (someone|a person|staff)|representative|manager)\b/i;

let _client: Anthropic | null = null;
function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  _client ??= new Anthropic();
  return _client;
}

export type Channel = "SMS" | "WEB";

export type AgentResult = { reply: string | null; escalated: boolean };

/**
 * Handle one inbound prospect message end-to-end: persist it, apply guardrails,
 * run the agent (unless staff has taken over), persist and return the reply.
 * Returns reply=null when nothing should be sent (staff takeover / opt-out).
 */
export async function handleInbound(prospectId: string, channel: Channel, body: string): Promise<AgentResult> {
  const text = body.trim().slice(0, 2000);
  await prisma.message.create({ data: { prospectId, direction: "IN", author: "PROSPECT", channel, body: text } });
  await prisma.prospect.update({ where: { id: prospectId }, data: { lastMessageAt: new Date() } });

  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });

  if (channel === "SMS" && OPT_OUT.test(text)) {
    await prisma.prospect.update({ where: { id: prospectId }, data: { smsOptOut: true } });
    return { reply: null, escalated: false }; // carrier / Twilio sends the compliant STOP confirmation
  }
  if (channel === "SMS" && OPT_IN.test(text) && prospect.smsOptOut) {
    await prisma.prospect.update({ where: { id: prospectId }, data: { smsOptOut: false } });
  }

  if (EMERGENCY.test(text)) {
    await prisma.prospect.update({
      where: { id: prospectId },
      data: { needsHuman: true, escalationReason: `[URGENT] Possible emergency: "${text.slice(0, 120)}"` },
    });
    return save(prospectId, channel,
      `If anyone is in danger, call 911 now. For urgent building issues call FGW at ${office()} (24/7 line). I've flagged this for our team right away.`,
      true);
  }

  if (!prospect.aiEnabled) return { reply: null, escalated: prospect.needsHuman }; // staff is handling it

  if (HUMAN.test(text)) {
    await prisma.prospect.update({
      where: { id: prospectId },
      data: { needsHuman: true, escalationReason: "Prospect asked for a person" },
    });
  }

  const ai = client();
  if (!ai) return save(prospectId, channel, fallbackReply(prospect.name), true, "AI offline — no API key configured");

  try {
    const reply = await runAgent(ai, prospectId, channel);
    const fresh = await prisma.prospect.findUnique({ where: { id: prospectId } });
    return save(prospectId, channel, reply, fresh?.needsHuman ?? false);
  } catch (err) {
    console.error("[leasing-agent]", err);
    return save(prospectId, channel,
      `Thanks for reaching out to FGW! I'm having trouble pulling up our listings right now. A team member will reply soon, or call ${office()}.`,
      true, "Agent error — needs manual reply");
  }
}

async function save(prospectId: string, channel: Channel, reply: string, escalated: boolean, reason?: string): Promise<AgentResult> {
  if (reason) {
    await prisma.prospect.update({ where: { id: prospectId }, data: { needsHuman: true, escalationReason: reason } });
  }
  await prisma.message.create({ data: { prospectId, direction: "OUT", author: "AGENT", channel, body: reply } });
  return { reply, escalated };
}

function fallbackReply(name: string | null): string {
  return `Hi${name ? " " + name : ""}! Thanks for contacting FGW Property Management about affordable housing. A leasing specialist will reply shortly. To speed things up, reply with: how many people will live in the home, your total yearly household income, and if you have a housing voucher. Or call ${office()}.`;
}

async function buildHistory(prospectId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = await prisma.message.findMany({
    where: { prospectId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  rows.reverse();
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of rows) {
    if (m.author === "SYSTEM") continue;
    const role: "user" | "assistant" = m.direction === "IN" ? "user" : "assistant";
    const content = m.author === "STAFF" ? `[FGW staff member wrote]: ${m.body}` : m.body;
    msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift(); // API requires user first
  return msgs;
}

async function contextNote(prospectId: string, channel: Channel): Promise<string> {
  const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId }, include: { property: true } });
  const known = {
    name: p.name,
    household_size: p.householdSize,
    annual_income: p.annualIncome,
    has_voucher: p.hasVoucher,
    bedrooms_wanted: p.bedroomsWanted,
    move_in_date: p.moveInDate?.toISOString().slice(0, 10),
    property_of_interest: p.property?.name,
    status: p.status,
    preferred_language: p.preferredLanguage,
    staff_handoff_pending: p.needsHuman,
  };
  return `Context for this reply — channel: ${channel}. Current local time: ${new Date().toString()}. Office phone: ${office()}. Known prospect details (do not re-ask what is already known): ${JSON.stringify(known)}`;
}

async function runAgent(ai: Anthropic, prospectId: string, channel: Channel): Promise<string> {
  const messages = await buildHistory(prospectId);
  if (messages.length === 0) throw new Error("empty history");
  // Volatile context rides as a trailing mid-conversation system message so
  // the system prompt + tools prefix stays cacheable.
  messages.push({ role: "system", content: await contextNote(prospectId, channel) });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await ai.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if a safety classifier declines, the API re-runs on a fallback model
      output_config: { effort: "low" }, // conversational route — fast + cheap
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      tools: leasingTools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { needsHuman: true, escalationReason: "Agent declined to answer — manual reply needed" },
      });
      return `Thanks for your message. A member of the FGW team will follow up with you directly. You can also call ${office()}.`;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new Error(`no text in response (stop_reason=${response.stop_reason})`);
      return channel === "SMS" ? toSms(text) : text.replace(/\*\*(.*?)\*\*/g, "$1");
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (t) => {
        try {
          const out = await runLeasingTool(prospectId, t.name, (t.input ?? {}) as Record<string, unknown>);
          return { type: "tool_result" as const, tool_use_id: t.id, content: out, is_error: out.startsWith("Error:") };
        } catch (e) {
          return { type: "tool_result" as const, tool_use_id: t.id, content: `Error: ${(e as Error).message}`, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  throw new Error("tool loop limit reached");
}

// Strip markdown and cap length for SMS.
function toSms(text: string): string {
  const plain = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1: $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return plain.length > 1500 ? plain.slice(0, 1497) + "..." : plain;
}
