"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WIP_LIMIT } from "@/lib/format";

function str(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}
function date(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  return s ? new Date(s) : null;
}

function refresh(projectId?: string | null) {
  revalidatePath("/brain");
  revalidatePath("/");
  if (projectId) revalidatePath(`/brain/projects/${projectId}`);
}

async function activeCount(): Promise<number> {
  return prisma.project.count({ where: { status: "ACTIVE" } });
}

// ── Inbox ──────────────────────────────────────────────────────────

export async function capture(formData: FormData) {
  const content = str(formData.get("content"));
  if (!content) return;
  await prisma.inboxItem.create({ data: { content } });
  refresh();
}

export async function dismissInboxItem(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.inboxItem.delete({ where: { id } });
  refresh();
}

// Turn a captured thought into a queued project.
export async function promoteInboxItem(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const item = await prisma.inboxItem.findUnique({ where: { id } });
  if (!item) return;
  const project = await prisma.project.create({
    data: { name: item.content, status: "QUEUED" },
  });
  await prisma.inboxItem.delete({ where: { id } });
  refresh();
  redirect(`/brain/projects/${project.id}`);
}

// ── Projects ───────────────────────────────────────────────────────

export async function createProject(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;
  const wantActive = str(formData.get("status")) === "ACTIVE";
  const slotFree = (await activeCount()) < WIP_LIMIT;
  const status = wantActive && slotFree ? "ACTIVE" : "QUEUED";
  await prisma.project.create({
    data: {
      name,
      outcome: str(formData.get("outcome")),
      why: str(formData.get("why")),
      priority: str(formData.get("priority")) ?? "MEDIUM",
      dueDate: date(formData.get("dueDate")),
      status,
      startedAt: status === "ACTIVE" ? new Date() : null,
    },
  });
  refresh();
  if (wantActive && !slotFree) redirect("/brain?flash=wip");
}

export async function updateProject(formData: FormData) {
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  if (!id || !name) return;
  await prisma.project.update({
    where: { id },
    data: {
      name,
      outcome: str(formData.get("outcome")),
      why: str(formData.get("why")),
      priority: str(formData.get("priority")) ?? "MEDIUM",
      dueDate: date(formData.get("dueDate")),
      waitingOn: str(formData.get("waitingOn")),
    },
  });
  refresh(id);
}

// Pull a project into an ACTIVE slot — blocked when all slots are full.
export async function activateProject(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  if ((await activeCount()) >= WIP_LIMIT) redirect("/brain?flash=wip");
  const p = await prisma.project.findUnique({ where: { id } });
  if (!p) return;
  await prisma.project.update({
    where: { id },
    data: {
      status: "ACTIVE",
      startedAt: p.startedAt ?? new Date(),
      completedAt: null,
      waitingOn: null,
    },
  });
  refresh(id);
}

// Send a project back to the queue, freeing its slot.
export async function queueProject(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.project.update({
    where: { id },
    data: { status: "QUEUED", waitingOn: null, completedAt: null },
  });
  refresh(id);
}

// Park a project on someone/something else — frees the slot but keeps
// it visible so blocked work doesn't silently die.
export async function waitProject(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.project.update({
    where: { id },
    data: { status: "WAITING", waitingOn: str(formData.get("waitingOn")) },
  });
  refresh(id);
}

// Close it out. The finish line of the whole system.
export async function closeProject(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.project.update({
    where: { id },
    data: {
      status: "DONE",
      completedAt: new Date(),
      closeNotes: str(formData.get("closeNotes")),
    },
  });
  refresh(id);
  redirect("/brain?flash=done");
}

// Deliberately killing a project is also closing it out — the list
// only shrinks when things end, one way or the other.
export async function dropProject(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.project.update({
    where: { id },
    data: {
      status: "DROPPED",
      completedAt: new Date(),
      closeNotes: str(formData.get("closeNotes")),
    },
  });
  refresh(id);
  redirect("/brain?flash=dropped");
}

export async function reopenProject(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.project.update({
    where: { id },
    data: { status: "QUEUED", completedAt: null, closeNotes: null },
  });
  refresh(id);
}

export async function deleteProject(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.project.delete({ where: { id } });
  refresh();
  redirect("/brain");
}

// ── Tasks ──────────────────────────────────────────────────────────

export async function addTask(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  const title = str(formData.get("title"));
  if (!projectId || !title) return;
  await prisma.projectTask.create({ data: { projectId, title } });
  refresh(projectId);
}

export async function toggleTask(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const task = await prisma.projectTask.findUnique({ where: { id } });
  if (!task) return;
  await prisma.projectTask.update({
    where: { id },
    data: { done: !task.done, doneAt: task.done ? null : new Date() },
  });
  refresh(task.projectId);
}

export async function deleteTask(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const task = await prisma.projectTask.findUnique({ where: { id } });
  if (!task) return;
  await prisma.projectTask.delete({ where: { id } });
  refresh(task.projectId);
}
