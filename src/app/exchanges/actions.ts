"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function str(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}
function int(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function flt(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function date(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s ? new Date(s) : null;
}

function refresh() {
  revalidatePath("/exchanges");
  revalidatePath("/");
}

export async function createMembership(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;
  await prisma.exchangeMembership.create({
    data: {
      name,
      network: str(formData.get("network")) ?? "RCI",
      memberNumber: str(formData.get("memberNumber")),
      tier: str(formData.get("tier")),
      timeshareId: str(formData.get("timeshareId")),
      joinDate: date(formData.get("joinDate")),
      expiresAt: date(formData.get("expiresAt")),
      membershipFee: flt(formData.get("membershipFee")),
      notes: str(formData.get("notes")),
    },
  });
  refresh();
}

export async function deleteMembership(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.exchangeMembership.delete({ where: { id } });
  refresh();
}

export async function createDeposit(formData: FormData) {
  const membershipId = str(formData.get("membershipId"));
  if (!membershipId) return;
  await prisma.exchangeDeposit.create({
    data: {
      membershipId,
      timeshareId: str(formData.get("timeshareId")),
      depositType: str(formData.get("depositType")) ?? "WEEK",
      description: str(formData.get("description")),
      tradingPower: flt(formData.get("tradingPower")),
      pointsValue: int(formData.get("pointsValue")),
      depositDate: date(formData.get("depositDate")),
      expiresAt: date(formData.get("expiresAt")),
      status: str(formData.get("status")) ?? "AVAILABLE",
      notes: str(formData.get("notes")),
    },
  });
  refresh();
}

export async function setDepositStatus(formData: FormData) {
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.exchangeDeposit.update({ where: { id }, data: { status } });
  refresh();
}

export async function deleteDeposit(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.exchangeDeposit.delete({ where: { id } });
  refresh();
}

export async function createPerk(formData: FormData) {
  const membershipId = str(formData.get("membershipId"));
  const name = str(formData.get("name"));
  if (!membershipId || !name) return;
  await prisma.membershipPerk.create({
    data: {
      membershipId,
      name,
      category: str(formData.get("category")) ?? "REWARD",
      value: flt(formData.get("value")),
      used: flt(formData.get("used")) ?? 0,
      expiresAt: date(formData.get("expiresAt")),
      notes: str(formData.get("notes")),
    },
  });
  refresh();
}

// Record additional usage against a perk's balance (e.g. redeem $50).
export async function usePerk(formData: FormData) {
  const id = str(formData.get("id"));
  const amount = flt(formData.get("amount"));
  if (!id || amount == null) return;
  const perk = await prisma.membershipPerk.findUnique({ where: { id } });
  if (!perk) return;
  await prisma.membershipPerk.update({
    where: { id },
    data: { used: perk.used + amount },
  });
  refresh();
}

export async function deletePerk(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.membershipPerk.delete({ where: { id } });
  refresh();
}
