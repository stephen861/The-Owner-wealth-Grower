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
function flt(v: FormDataEntryValue | null): number {
  const n = Number(str(v) ?? "0");
  return Number.isFinite(n) ? n : 0;
}
function date(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s ? new Date(s) : null;
}

function refresh() {
  revalidatePath("/reservations");
  revalidatePath("/");
}

export async function createReservation(formData: FormData) {
  const resort = str(formData.get("resort"));
  const checkIn = date(formData.get("checkIn"));
  const checkOut = date(formData.get("checkOut"));
  if (!resort || !checkIn || !checkOut) return;
  await prisma.reservation.create({
    data: {
      timeshareId: str(formData.get("timeshareId")),
      resort,
      location: str(formData.get("location")),
      checkIn,
      checkOut,
      guests: int(formData.get("guests")) || 1,
      unitType: str(formData.get("unitType")),
      confirmationNumber: str(formData.get("confirmationNumber")),
      pointsUsed: int(formData.get("pointsUsed")),
      cashCost: flt(formData.get("cashCost")),
      status: str(formData.get("status")) ?? "CONFIRMED",
      guestName: str(formData.get("guestName")),
      notes: str(formData.get("notes")),
    },
  });
  refresh();
}

export async function updateReservationStatus(formData: FormData) {
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.reservation.update({ where: { id }, data: { status } });
  refresh();
}

export async function deleteReservation(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.reservation.delete({ where: { id } });
  refresh();
}
