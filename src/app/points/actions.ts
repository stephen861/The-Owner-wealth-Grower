"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function str(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}
function int(v: FormDataEntryValue | null): number {
  const n = Number(str(v) ?? "0");
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function date(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s ? new Date(s) : null;
}

function refresh() {
  revalidatePath("/points");
  revalidatePath("/");
}

export async function upsertPointsAccount(formData: FormData) {
  const timeshareId = str(formData.get("timeshareId"));
  const useYear = int(formData.get("useYear"));
  if (!timeshareId || !useYear) return;
  const data = {
    allotted: int(formData.get("allotted")),
    used: int(formData.get("used")),
    banked: int(formData.get("banked")),
    borrowed: int(formData.get("borrowed")),
    expiresAt: date(formData.get("expiresAt")),
    notes: str(formData.get("notes")),
  };
  await prisma.pointsAccount.upsert({
    where: { timeshareId_useYear: { timeshareId, useYear } },
    create: { timeshareId, useYear, ...data },
    update: data,
  });
  refresh();
}

export async function deletePointsAccount(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.pointsAccount.delete({ where: { id } });
  refresh();
}

export async function createBenefit(formData: FormData) {
  const timeshareId = str(formData.get("timeshareId"));
  const name = str(formData.get("name"));
  if (!timeshareId || !name) return;
  await prisma.benefit.create({
    data: {
      timeshareId,
      name,
      category: str(formData.get("category")) ?? "PERK",
      tier: str(formData.get("tier")),
      description: str(formData.get("description")),
      totalAllowance: str(formData.get("totalAllowance"))
        ? int(formData.get("totalAllowance"))
        : null,
      usedAllowance: int(formData.get("usedAllowance")),
      expiresAt: date(formData.get("expiresAt")),
    },
  });
  refresh();
}

export async function deleteBenefit(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.benefit.delete({ where: { id } });
  refresh();
}

// Increment a benefit's used allowance by 1 (quick "redeem" button).
export async function redeemBenefit(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const b = await prisma.benefit.findUnique({ where: { id } });
  if (!b) return;
  await prisma.benefit.update({
    where: { id },
    data: { usedAllowance: b.usedAllowance + 1 },
  });
  refresh();
}
