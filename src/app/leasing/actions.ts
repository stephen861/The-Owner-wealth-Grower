"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendSms, twilioRestConfigured } from "@/lib/leasing/twilio";
import { PROSPECT_STATUSES } from "@/lib/leasing/tools";

function str(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}
function num(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function refresh(id?: string) {
  revalidatePath("/leasing");
  if (id) revalidatePath(`/leasing/${id}`);
}

// Staff reply. Sends by SMS when the prospect has a phone and Twilio REST is
// configured; web-chat prospects see it on their next poll.
export async function staffReply(formData: FormData) {
  const id = str(formData.get("id"));
  const body = str(formData.get("body"));
  if (!id || !body) return;
  const p = await prisma.prospect.findUnique({ where: { id } });
  if (!p) return;
  const channel = p.phone ? "SMS" : "WEB";
  if (channel === "SMS") {
    if (p.smsOptOut) throw new Error("Prospect opted out of SMS (replied STOP).");
    if (!twilioRestConfigured()) throw new Error("Twilio REST not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.");
    await sendSms(p.phone!, body);
  }
  await prisma.message.create({ data: { prospectId: id, direction: "OUT", author: "STAFF", channel, body } });
  // A staff reply means a human owns the thread until they hand it back.
  await prisma.prospect.update({ where: { id }, data: { aiEnabled: false, needsHuman: false, lastMessageAt: new Date() } });
  refresh(id);
}

export async function toggleAi(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const p = await prisma.prospect.findUnique({ where: { id } });
  if (!p) return;
  await prisma.prospect.update({ where: { id }, data: { aiEnabled: !p.aiEnabled } });
  refresh(id);
}

export async function resolveEscalation(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.prospect.update({ where: { id }, data: { needsHuman: false, escalationReason: null } });
  refresh(id);
}

export async function updateProspect(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const status = str(formData.get("status"));
  await prisma.prospect.update({
    where: { id },
    data: {
      name: str(formData.get("name")),
      email: str(formData.get("email")),
      householdSize: num(formData.get("householdSize")),
      annualIncome: num(formData.get("annualIncome")),
      bedroomsWanted: num(formData.get("bedroomsWanted")),
      hasVoucher: str(formData.get("hasVoucher")) == null ? null : str(formData.get("hasVoucher")) === "true",
      status: status && (PROSPECT_STATUSES as readonly string[]).includes(status) ? status : undefined,
      notes: str(formData.get("notes")),
    },
  });
  refresh(id);
}

export async function setTourStatus(formData: FormData) {
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  const t = await prisma.tour.update({ where: { id }, data: { status } });
  refresh(t.prospectId);
}

export async function deleteProspect(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.prospect.delete({ where: { id } });
  refresh();
  redirect("/leasing");
}

// ── Properties / units / income limits ─────────────────────────────

function refreshProps() {
  revalidatePath("/leasing/properties");
  revalidatePath("/leasing");
}

export async function createProperty(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;
  await prisma.property.create({
    data: {
      name,
      address: str(formData.get("address")),
      city: str(formData.get("city")),
      state: str(formData.get("state")),
      program: str(formData.get("program")) ?? "LIHTC",
      acceptsVouchers: str(formData.get("acceptsVouchers")) !== "false",
      officePhone: str(formData.get("officePhone")),
      officeHours: str(formData.get("officeHours")),
      amenities: str(formData.get("amenities")),
      policies: str(formData.get("policies")),
      applicationUrl: str(formData.get("applicationUrl")),
      applicationFee: num(formData.get("applicationFee")),
      minIncomeMultiple: num(formData.get("minIncomeMultiple")) ?? 2,
    },
  });
  refreshProps();
}

export async function deleteProperty(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.property.delete({ where: { id } });
  refreshProps();
}

export async function createUnit(formData: FormData) {
  const propertyId = str(formData.get("propertyId"));
  const unitNumber = str(formData.get("unitNumber"));
  const bedrooms = num(formData.get("bedrooms"));
  const rent = num(formData.get("rent"));
  if (!propertyId || !unitNumber || bedrooms == null || rent == null) return;
  const avail = str(formData.get("availableDate"));
  await prisma.unit.create({
    data: {
      propertyId,
      unitNumber,
      bedrooms,
      rent,
      bathrooms: num(formData.get("bathrooms")) ?? 1,
      sqft: num(formData.get("sqft")),
      amiPercent: num(formData.get("amiPercent")) ?? 60,
      accessible: str(formData.get("accessible")) === "true",
      availableDate: avail ? new Date(avail) : null,
    },
  });
  refreshProps();
}

export async function setUnitStatus(formData: FormData) {
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.unit.update({ where: { id }, data: { status } });
  refreshProps();
}

export async function deleteUnit(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.unit.delete({ where: { id } });
  refreshProps();
}

// Paste one AMI row: household sizes 1..8 as comma-separated max incomes.
export async function upsertIncomeLimits(formData: FormData) {
  const propertyId = str(formData.get("propertyId"));
  const amiPercent = num(formData.get("amiPercent"));
  const values = (str(formData.get("limits")) ?? "")
    .split(/[,\s]+/)
    .map((v) => Number(v.replace(/[$,]/g, "")))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!propertyId || amiPercent == null || values.length === 0) return;
  const year = num(formData.get("year"));
  await prisma.$transaction(
    values.map((maxIncome, i) =>
      prisma.incomeLimit.upsert({
        where: { propertyId_amiPercent_householdSize: { propertyId, amiPercent, householdSize: i + 1 } },
        update: { maxIncome, year },
        create: { propertyId, amiPercent, householdSize: i + 1, maxIncome, year },
      }),
    ),
  );
  refreshProps();
}
