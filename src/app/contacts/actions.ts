"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { date, flt, int, pct, str } from "@/lib/form";

function refresh(id?: string) {
  revalidatePath("/contacts");
  revalidatePath("/pipeline");
  revalidatePath("/activities");
  revalidatePath("/");
  if (id) revalidatePath(`/contacts/${id}`);
}

function contactFields(formData: FormData) {
  return {
    firstName: str(formData.get("firstName")) ?? "",
    lastName: str(formData.get("lastName")),
    email: str(formData.get("email")),
    phone: str(formData.get("phone")),
    company: str(formData.get("company")),
    type: str(formData.get("type")) ?? "LEAD",
    status: str(formData.get("status")) ?? "NEW",
    source: str(formData.get("source")),
    city: str(formData.get("city")),
    state: str(formData.get("state")),
    tags: str(formData.get("tags")),
    nextFollowUpAt: date(formData.get("nextFollowUpAt")),
    notes: str(formData.get("notes")),
  };
}

export async function createContact(formData: FormData) {
  const data = contactFields(formData);
  if (!data.firstName) return;
  await prisma.contact.create({ data });
  refresh();
}

export async function updateContact(formData: FormData) {
  const id = str(formData.get("id"));
  const data = contactFields(formData);
  if (!id || !data.firstName) return;
  await prisma.contact.update({ where: { id }, data });
  refresh(id);
}

export async function deleteContact(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.contact.delete({ where: { id } });
  refresh();
  redirect("/contacts");
}

// Log a touchpoint (and stamp the contact's last-contact date) or create an
// open follow-up task, depending on whether a due date was supplied.
export async function logActivity(formData: FormData) {
  const subject = str(formData.get("subject"));
  if (!subject) return;
  const contactId = str(formData.get("contactId"));
  const dueAt = date(formData.get("dueAt"));
  const type = str(formData.get("type")) ?? "NOTE";

  await prisma.activity.create({
    data: {
      contactId,
      dealId: str(formData.get("dealId")),
      type,
      subject,
      body: str(formData.get("body")),
      dueAt,
      done: !dueAt && type !== "TASK",
      doneAt: !dueAt && type !== "TASK" ? new Date() : null,
    },
  });

  if (contactId) {
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(dueAt ? { nextFollowUpAt: dueAt } : { lastContactAt: new Date() }),
      },
    });
  }
  refresh(contactId ?? undefined);
}

export async function completeActivity(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const activity = await prisma.activity.update({
    where: { id },
    data: { done: true, doneAt: new Date() },
  });
  if (activity.contactId) {
    await prisma.contact.update({
      where: { id: activity.contactId },
      data: { lastContactAt: new Date(), nextFollowUpAt: null },
    });
  }
  refresh(activity.contactId ?? undefined);
}

export async function deleteActivity(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const activity = await prisma.activity.delete({ where: { id } });
  refresh(activity.contactId ?? undefined);
}

export async function createDeal(formData: FormData) {
  const contactId = str(formData.get("contactId"));
  const title = str(formData.get("title"));
  if (!contactId || !title) return;
  await prisma.deal.create({
    data: {
      contactId,
      title,
      stage: str(formData.get("stage")) ?? "NEW",
      value: flt(formData.get("value")),
      commissionRate: pct(formData.get("commissionRate")),
      probability: Math.min(100, Math.max(0, int(formData.get("probability")))),
      expectedCloseAt: date(formData.get("expectedCloseAt")),
      notes: str(formData.get("notes")),
    },
  });
  refresh(contactId);
}

export async function updateDealStage(formData: FormData) {
  const id = str(formData.get("id"));
  const stage = str(formData.get("stage"));
  if (!id || !stage) return;
  const closing = stage === "WON" || stage === "LOST";
  const deal = await prisma.deal.update({
    where: { id },
    data: {
      stage,
      closedAt: closing ? new Date() : null,
      probability: stage === "WON" ? 100 : stage === "LOST" ? 0 : undefined,
    },
  });
  refresh(deal.contactId);
}

export async function updateDeal(formData: FormData) {
  const id = str(formData.get("id"));
  const title = str(formData.get("title"));
  if (!id || !title) return;
  const deal = await prisma.deal.update({
    where: { id },
    data: {
      title,
      stage: str(formData.get("stage")) ?? "NEW",
      value: flt(formData.get("value")),
      commissionRate: pct(formData.get("commissionRate")),
      probability: Math.min(100, Math.max(0, int(formData.get("probability")))),
      expectedCloseAt: date(formData.get("expectedCloseAt")),
      lostReason: str(formData.get("lostReason")),
      notes: str(formData.get("notes")),
    },
  });
  refresh(deal.contactId);
}

export async function deleteDeal(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const deal = await prisma.deal.delete({ where: { id } });
  refresh(deal.contactId);
}
