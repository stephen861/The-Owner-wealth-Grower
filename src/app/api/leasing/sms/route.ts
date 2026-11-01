// Twilio inbound SMS webhook. Point your Twilio number's "A message comes in"
// webhook (HTTP POST) at: https://<your-domain>/api/leasing/sms
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleInbound } from "@/lib/leasing/agent";
import { sendSms, twilioRestConfigured, twiml, verifyTwilioSignature } from "@/lib/leasing/twilio";

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

  const prospect = await prisma.prospect.upsert({
    where: { phone: from },
    update: {},
    create: { phone: from, source: "SMS" },
  });

  if (twilioRestConfigured()) {
    // Ack immediately; run the agent after the response so Twilio never times out.
    after(async () => {
      const { reply } = await handleInbound(prospect.id, "SMS", body);
      if (reply) await sendSms(from, reply).catch((e) => console.error("[sms send]", e));
    });
    return twiml(null);
  }

  const { reply } = await handleInbound(prospect.id, "SMS", body);
  return twiml(reply);
}
