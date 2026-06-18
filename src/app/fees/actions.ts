"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function str(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}
function flt(v: FormDataEntryValue | null): number {
  const n = Number(str(v) ?? "0");
  return Number.isFinite(n) ? n : 0;
}
function date(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s ? new Date(s) : null;
}

function refresh() {
  revalidatePath("/fees");
  revalidatePath("/");
}

export async function createFee(formData: FormData) {
  const timeshareId = str(formData.get("timeshareId"));
  const dueDate = date(formData.get("dueDate"));
  if (!timeshareId || !dueDate) return;
  await prisma.fee.create({
    data: {
      timeshareId,
      type: str(formData.get("type")) ?? "MAINTENANCE",
      description: str(formData.get("description")),
      amount: flt(formData.get("amount")),
      dueDate,
      recurrence: str(formData.get("recurrence")) ?? "ANNUAL",
      paid: str(formData.get("paid")) === "true",
      paidDate: str(formData.get("paid")) === "true" ? new Date() : null,
    },
  });
  refresh();
}

export async function togglePaid(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const fee = await prisma.fee.findUnique({ where: { id } });
  if (!fee) return;
  const paid = !fee.paid;
  await prisma.fee.update({
    where: { id },
    data: { paid, paidDate: paid ? new Date() : null },
  });
  refresh();
}

export async function deleteFee(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.fee.delete({ where: { id } });
  refresh();
}
