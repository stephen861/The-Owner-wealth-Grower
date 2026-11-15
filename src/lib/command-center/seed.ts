// Seeds / resets the single demo dataset.
//
// Touches ONLY Demo* tables. Relations are resolved from the dataset's source
// IDs, which is also how the documented import mapping would work — so the
// seeder exercises the same reconciliation path the real importer would.

import { prisma } from "@/lib/prisma";
import { buildDemoDataset } from "./demo-data";

/** Delete every Demo* row, children first. Nothing else is touched. */
export async function clearDemoData() {
  await prisma.demoAuditEvent.deleteMany();
  await prisma.demoApproval.deleteMany();
  await prisma.demoAgentCheckIn.deleteMany();
  await prisma.demoSopReference.deleteMany();
  await prisma.demoTask.deleteMany();
  await prisma.demoWorkOrder.deleteMany();
  await prisma.demoSupplyItem.deleteMany();
  await prisma.demoAdvance.deleteMany();
  await prisma.demoMoneyEntry.deleteMany();
  await prisma.demoJob.deleteMany();
  await prisma.demoVendor.deleteMany();
  await prisma.demoContact.deleteMany();
  await prisma.demoReferral.deleteMany();
  await prisma.demoPlacement.deleteMany();
  await prisma.demoChecklistItem.deleteMany();
  await prisma.demoProperty.deleteMany();
}

export async function seedDemoData(now: Date = new Date()) {
  const data = buildDemoDataset(now);

  await prisma.demoProperty.createMany({
    data: data.properties.map((p) => ({
      sourceId: p.sourceId,
      division: p.division,
      name: p.name,
      addressLine: p.addressLine,
      city: p.city,
      state: p.state,
      licenseStatus: p.licenseStatus,
      licenseStatusRaw: p.licenseStatusRaw,
      revenueEligible: p.revenueEligible,
      expectedFeesCents: p.expectedFeesCents,
      bedCapacity: p.bedCapacity,
      notes: p.notes,
    })),
  });

  // Resolve the source IDs the rest of the dataset refers to.
  const propertyRows = await prisma.demoProperty.findMany({
    select: { id: true, sourceId: true, division: true },
  });
  const propertyId = new Map(propertyRows.map((p) => [p.sourceId, p.id]));

  await prisma.demoChecklistItem.createMany({
    data: data.checklistItems.map((c) => ({
      propertyId: propertyId.get(c.propertySourceId)!,
      sourceId: c.sourceId,
      label: c.label,
      category: c.category,
      required: c.required,
      status: c.status,
      evidenceNote: c.evidenceNote,
      blockedReason: c.blockedReason,
      completedAt: c.completedAt,
    })),
  });

  await prisma.demoPlacement.createMany({
    data: data.placements.map((p) => ({
      propertyId: propertyId.get(p.propertySourceId)!,
      sourceId: p.sourceId,
      occupantCode: p.occupantCode,
      displayLabel: p.displayLabel,
      status: p.status,
      movedInAt: p.movedInAt,
    })),
  });

  await prisma.demoReferral.createMany({
    data: data.referrals.map((r) => ({
      sourceId: r.sourceId,
      division: r.division,
      referralCode: r.referralCode,
      referrerLabel: r.referrerLabel,
      stage: r.stage,
      propertyId: r.propertySourceId ? propertyId.get(r.propertySourceId)! : null,
      decisionRecordedBy: r.decisionRecordedBy,
      decisionNote: r.decisionNote,
      decisionAt: r.decisionAt,
      blocked: r.blocked,
      blockedReason: r.blockedReason,
      receivedAt: r.receivedAt,
      notes: r.notes,
    })),
  });

  await prisma.demoContact.createMany({ data: data.contacts });
  await prisma.demoVendor.createMany({ data: data.vendors });

  const vendorRows = await prisma.demoVendor.findMany({
    select: { id: true, sourceId: true },
  });
  const vendorId = new Map(vendorRows.map((v) => [v.sourceId, v.id]));

  await prisma.demoJob.createMany({
    data: data.jobs.map((j) => ({
      sourceId: j.sourceId,
      division: j.division,
      title: j.title,
      status: j.status,
      quotedCents: j.quotedCents,
      approvedCents: j.approvedCents,
      propertyId: j.propertySourceId ? propertyId.get(j.propertySourceId)! : null,
      vendorId: j.vendorSourceId ? vendorId.get(j.vendorSourceId)! : null,
      blocked: j.blocked,
      blockedReason: j.blockedReason,
    })),
  });

  const jobRows = await prisma.demoJob.findMany({ select: { id: true, sourceId: true } });
  const jobId = new Map(jobRows.map((j) => [j.sourceId, j.id]));

  await prisma.demoMoneyEntry.createMany({
    data: data.moneyEntries.map((m) => ({
      sourceId: m.sourceId,
      division: m.division,
      kind: m.kind,
      amountCents: m.amountCents,
      occurredAt: m.occurredAt,
      memo: m.memo,
      propertyId: m.propertySourceId ? propertyId.get(m.propertySourceId)! : null,
      jobId: m.jobSourceId ? jobId.get(m.jobSourceId)! : null,
      vendorId: m.vendorSourceId ? vendorId.get(m.vendorSourceId)! : null,
    })),
  });

  await prisma.demoAdvance.createMany({ data: data.advances });

  await prisma.demoSupplyItem.createMany({
    data: data.supplyItems.map((s) => ({
      sourceId: s.sourceId,
      division: s.division,
      name: s.name,
      category: s.category,
      quantity: s.quantity,
      unitCostCents: s.unitCostCents,
      propertyId: s.propertySourceId ? propertyId.get(s.propertySourceId)! : null,
    })),
  });

  await prisma.demoWorkOrder.createMany({
    data: data.workOrders.map((w) => ({
      sourceId: w.sourceId,
      division: w.division,
      title: w.title,
      category: w.category,
      priority: w.priority,
      status: w.status,
      propertyId: w.propertySourceId ? propertyId.get(w.propertySourceId)! : null,
      reportedAt: w.reportedAt,
      completedAt: w.completedAt,
      estimateCents: w.estimateCents,
      actualCents: w.actualCents,
      blocked: w.blocked,
      blockedReason: w.blockedReason,
    })),
  });

  await prisma.demoTask.createMany({
    data: data.tasks.map((t) => ({
      sourceId: t.sourceId,
      division: t.division,
      title: t.title,
      assignee: t.assignee,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      blockedReason: t.blockedReason,
      propertyId: t.propertySourceId ? propertyId.get(t.propertySourceId)! : null,
    })),
  });

  await prisma.demoSopReference.createMany({ data: data.sopReferences });
  await prisma.demoAgentCheckIn.createMany({ data: data.agentCheckIns });

  // Approvals reference their subject by the subject's source ID, so the
  // queue stays readable and the gate can look the subject up by one key.
  await prisma.demoApproval.createMany({
    data: data.approvals.map((a) => ({
      division: a.division,
      title: a.title,
      subjectType: a.subjectType,
      subjectId: a.subjectSourceId,
      requestedBy: a.requestedBy,
      amountCents: a.amountCents,
      state: a.state,
      decidedBy: a.decidedBy,
      decisionNote: a.decisionNote,
      decidedAt: a.decidedAt,
    })),
  });

  await prisma.demoAuditEvent.create({
    data: {
      division: "FGW",
      actor: "demo seeder",
      actorKind: "SYSTEM",
      action: "DEMO_DATASET_LOADED",
      detail: "Loaded the synthetic demo dataset. No live data was read.",
    },
  });
}

export async function resetDemoData(now: Date = new Date()) {
  await clearDemoData();
  await seedDemoData(now);
}

/** Row counts per Demo table — used by the modules screen and the tests. */
export async function demoDataCounts() {
  const [
    properties, checklistItems, placements, referrals, contacts, vendors,
    jobs, moneyEntries, advances, supplyItems, workOrders, tasks,
    sopReferences, agentCheckIns, approvals, auditEvents,
  ] = await Promise.all([
    prisma.demoProperty.count(),
    prisma.demoChecklistItem.count(),
    prisma.demoPlacement.count(),
    prisma.demoReferral.count(),
    prisma.demoContact.count(),
    prisma.demoVendor.count(),
    prisma.demoJob.count(),
    prisma.demoMoneyEntry.count(),
    prisma.demoAdvance.count(),
    prisma.demoSupplyItem.count(),
    prisma.demoWorkOrder.count(),
    prisma.demoTask.count(),
    prisma.demoSopReference.count(),
    prisma.demoAgentCheckIn.count(),
    prisma.demoApproval.count(),
    prisma.demoAuditEvent.count(),
  ]);
  return {
    properties, checklistItems, placements, referrals, contacts, vendors,
    jobs, moneyEntries, advances, supplyItems, workOrders, tasks,
    sopReferences, agentCheckIns, approvals, auditEvents,
  };
}
