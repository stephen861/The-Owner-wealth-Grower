// Twilio inbound SMS webhook. Point your Twilio number's "A message comes in"
// webhook (HTTP POST) at: https://<your-domain>/api/leasing/sms
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleInbound } from "@/lib/leasing/agent";
import { canText, sendSms, twilioRestConfigured, twiml, verifyTwilioSignature } from "@/lib/leasing/twilio";
import type { AgentResult } from "@/lib/leasing/agent";
import { handleConfirmerSms } from "@/lib/leasing/tours";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = v.toString()));

  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
    const url = base ? base + new URL(req.url).pathname : req.url;
    if (!verifyTwilioSignature(token, url, params, req.headers.get("x-twilio-signature"))) {
      return new Response("Invalid signature", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("TWILIO_AUTH_TOKEN not configured", { status: 500 });
  }

  const from = params.From?.trim();
  const body = params.Body ?? "";
  if (!from) return twiml(null);

  // Tour confirmer (TOUR_CONFIRMER_PHONE) replying YES/NO/SHOWED/NOSHOW <code>.
  // Anything else from that phone goes to the agent like any other text.
  const confirmerReply = await handleConfirmerSms(from, body);
  if (confirmerReply !== null) {
    if (twilioRestConfigured()) {
      after(async () => {
        await sendSms(from, confirmerReply).catch((e) => console.error("[sms confirmer reply]", e));
      });
      return twiml(null);
    }
    return twiml(canText(from) ? confirmerReply : null);
  }

  const prospect = await prisma.prospect.upsert({
    where: { phone: from },
    update: {},
    create: { phone: from, source: "SMS" },
  });

  if (twilioRestConfigured()) {
    // Ack immediately; run the agent after the response so Twilio never times out.
    after(async () => {
      const result = await handleInbound(prospect.id, "SMS", body);
      if (!result.reply) return;
      const sent = await sendSms(from, result.reply).catch((e) => {
        console.error("[sms send]", e);
        return false;
      });
      if (!sent) await markUndelivered(result);
    });
    return twiml(null);
  }

  const result = await handleInbound(prospect.id, "SMS", body);
  if (result.reply && !canText(from)) {
    console.info(`[sms DRY RUN] not live — held TwiML reply to ${from}`);
    await markUndelivered(result);
    return twiml(null);
  }
  return twiml(result.reply);
}

async function markUndelivered(result: AgentResult) {
  if (result.messageId) await prisma.message.update({ where: { id: result.messageId }, data: { delivered: false } });
}
