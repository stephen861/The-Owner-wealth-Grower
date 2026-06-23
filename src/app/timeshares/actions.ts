"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

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
function date(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s ? new Date(s) : null;
}

export async function createTimeshare(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;
  await prisma.timeshare.create({
    data: {
      name,
      brand: str(formData.get("brand")),
      resort: str(formData.get("resort")),
      location: str(formData.get("location")),
      ownershipType: str(formData.get("ownershipType")) ?? "POINTS",
      contractNumber: str(formData.get("contractNumber")),
      memberNumber: str(formData.get("memberNumber")),
      deededWeek: str(formData.get("deededWeek")),
      unitType: str(formData.get("unitType")),
      ownershipShare: num(formData.get("ownershipShare")),
      annualPoints: num(formData.get("annualPoints")),
      useYear: str(formData.get("useYear")),
      purchaseDate: date(formData.get("purchaseDate")),
      purchasePrice: num(formData.get("purchasePrice")),
      notes: str(formData.get("notes")),
    },
  });
  revalidatePath("/timeshares");
  revalidatePath("/");
  redirect("/timeshares");
}

export async function updateTimeshare(formData: FormData) {
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  if (!id || !name) return;
  await prisma.timeshare.update({
    where: { id },
    data: {
      name,
      brand: str(formData.get("brand")),
      resort: str(formData.get("resort")),
      location: str(formData.get("location")),
      ownershipType: str(formData.get("ownershipType")) ?? "POINTS",
      contractNumber: str(formData.get("contractNumber")),
      memberNumber: str(formData.get("memberNumber")),
      deededWeek: str(formData.get("deededWeek")),
      unitType: str(formData.get("unitType")),
      ownershipShare: num(formData.get("ownershipShare")),
      annualPoints: num(formData.get("annualPoints")),
      useYear: str(formData.get("useYear")),
      purchaseDate: date(formData.get("purchaseDate")),
      purchasePrice: num(formData.get("purchasePrice")),
      active: str(formData.get("active")) === "on" || str(formData.get("active")) === "true",
      notes: str(formData.get("notes")),
    },
  });
  revalidatePath("/timeshares");
  revalidatePath(`/timeshares/${id}`);
  revalidatePath("/");
  redirect(`/timeshares/${id}`);
}

export async function deleteTimeshare(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.timeshare.delete({ where: { id } });
  revalidatePath("/timeshares");
  revalidatePath("/");
  redirect("/timeshares");
}
