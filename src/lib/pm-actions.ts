"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { periodKey } from "@/lib/format";
import { date, flt, int, pct, str } from "@/lib/form";

function refresh(paths: string[] = []) {
  for (const p of ["/", "/properties", "/leases", "/maintenance", "/vendors", "/owners", ...paths]) {
    revalidatePath(p);
  }
}

// --- Properties -------------------------------------------------------------

function propertyFields(formData: FormData) {
  return {
    name: str(formData.get("name")) ?? "",
    addressLine1: str(formData.get("addressLine1")),
    addressLine2: str(formData.get("addressLine2")),
    city: str(formData.get("city")),
    state: str(formData.get("state")),
    zip: str(formData.get("zip")),
    type: str(formData.get("type")) ?? "SINGLE_FAMILY",
    ownerId: str(formData.get("ownerId")),
    managementFeeRate: pct(formData.get("managementFeeRate")),
    purchaseDate: date(formData.get("purchaseDate")),
    purchasePrice: formData.get("purchasePrice") ? flt(formData.get("purchasePrice")) : null,
    marketValue: formData.get("marketValue") ? flt(formData.get("marketValue")) : null,
    mortgageBalance: formData.get("mortgageBalance")
      ? flt(formData.get("mortgageBalance"))
      : null,
    notes: str(formData.get("notes")),
  };
}

export async function createProperty(formData: FormData) {
  const data = propertyFields(formData);
  if (!data.name) return;
  // A single-family home is one unit — create it up front so the property is
  // immediately leasable without a second step.
  const singleUnit = data.type === "SINGLE_FAMILY" || data.type === "SHORT_TERM";
  const property = await prisma.property.create({
    data: {
      ...data,
      units: singleUnit
        ? { create: [{ label: "Main", marketRent: flt(formData.get("marketRent")) }] }
        : undefined,
    },
  });
  refresh([`/properties/${property.id}`]);
}

export async function updateProperty(formData: FormData) {
  const id = str(formData.get("id"));
  const data = propertyFields(formData);
  if (!id || !data.name) return;
  await prisma.property.update({
    where: { id },
    data: { ...data, active: formData.get("active") === "on" },
  });
  refresh([`/properties/${id}`]);
}

export async function deleteProperty(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.property.delete({ where: { id } });
  refresh();
  redirect("/properties");
}

// --- Units ------------------------------------------------------------------

export async function createUnit(formData: FormData) {
  const propertyId = str(formData.get("propertyId"));
  const label = str(formData.get("label"));
  if (!propertyId || !label) return;
  await prisma.unit.create({
    data: {
      propertyId,
      label,
      beds: flt(formData.get("beds")),
      baths: flt(formData.get("baths")),
      sqft: formData.get("sqft") ? int(formData.get("sqft")) : null,
      marketRent: flt(formData.get("marketRent")),
      status: str(formData.get("status")) ?? "VACANT",
      notes: str(formData.get("notes")),
    },
  });
  refresh([`/properties/${propertyId}`]);
}

export async function updateUnitStatus(formData: FormData) {
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  const unit = await prisma.unit.update({ where: { id }, data: { status } });
  refresh([`/properties/${unit.propertyId}`]);
}

export async function deleteUnit(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const unit = await prisma.unit.delete({ where: { id } });
  refresh([`/properties/${unit.propertyId}`]);
}

// --- Leases -----------------------------------------------------------------

export async function createLease(formData: FormData) {
  const unitId = str(formData.get("unitId"));
  const tenantId = str(formData.get("tenantId"));
  const startDate = date(formData.get("startDate"));
  if (!unitId || !tenantId || !startDate) return;

  const status = str(formData.get("status")) ?? "ACTIVE";
  const lease = await prisma.lease.create({
    data: {
      unitId,
      tenantId,
      startDate,
      endDate: date(formData.get("endDate")),
      rentAmount: flt(formData.get("rentAmount")),
      rentDueDay: Math.min(28, Math.max(1, int(formData.get("rentDueDay")) || 1)),
      depositAmount: flt(formData.get("depositAmount")),
      depositHeld: flt(formData.get("depositHeld")),
      lateFeeAmount: flt(formData.get("lateFeeAmount")),
      lateFeeAfterDay: Math.max(0, int(formData.get("lateFeeAfterDay"))),
      status,
      moveInDate: date(formData.get("moveInDate")) ?? startDate,
      notes: str(formData.get("notes")),
    },
  });

  // Signing a lease fills the unit, and the tenant becomes a TENANT contact.
  if (status === "ACTIVE") {
    await prisma.unit.update({ where: { id: unitId }, data: { status: "OCCUPIED" } });
    await prisma.contact.update({
      where: { id: tenantId },
      data: { type: "TENANT", status: "ACTIVE" },
    });
  }
  refresh([`/leases/${lease.id}`, `/contacts/${tenantId}`]);
}

export async function updateLeaseStatus(formData: FormData) {
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  const ended = status === "ENDED";
  const lease = await prisma.lease.update({
    where: { id },
    data: { status, moveOutDate: ended ? new Date() : null },
  });
  await prisma.unit.update({
    where: { id: lease.unitId },
    data: {
      status: ended ? "VACANT" : status === "NOTICE" ? "NOTICE" : "OCCUPIED",
    },
  });
  refresh([`/leases/${id}`]);
}

export async function deleteLease(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const lease = await prisma.lease.delete({ where: { id } });
  await prisma.unit.update({ where: { id: lease.unitId }, data: { status: "VACANT" } });
  refresh();
  redirect("/leases");
}

// --- Ledger: charges & payments --------------------------------------------

export async function createCharge(formData: FormData) {
  const leaseId = str(formData.get("leaseId"));
  const dueDate = date(formData.get("dueDate"));
  if (!leaseId || !dueDate) return;
  await prisma.charge.create({
    data: {
      leaseId,
      type: str(formData.get("type")) ?? "OTHER",
      description: str(formData.get("description")),
      amount: flt(formData.get("amount")),
      dueDate,
      period: str(formData.get("period")),
    },
  });
  refresh([`/leases/${leaseId}`]);
}

export async function deleteCharge(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const charge = await prisma.charge.delete({ where: { id } });
  refresh([`/leases/${charge.leaseId}`]);
}

export async function recordPayment(formData: FormData) {
  const leaseId = str(formData.get("leaseId"));
  const amount = flt(formData.get("amount"));
  if (!leaseId || amount <= 0) return;
  await prisma.payment.create({
    data: {
      leaseId,
      amount,
      receivedAt: date(formData.get("receivedAt")) ?? new Date(),
      method: str(formData.get("method")) ?? "ACH",
      reference: str(formData.get("reference")),
      notes: str(formData.get("notes")),
    },
  });
  refresh([`/leases/${leaseId}`]);
}

export async function deletePayment(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const payment = await prisma.payment.delete({ where: { id } });
  refresh([`/leases/${payment.leaseId}`]);
}

// Post this month's rent to every active lease that has not been billed yet.
// Idempotent: the (lease, period, RENT) triple is checked before inserting, so
// running it twice in a month is a no-op.
export async function postMonthlyRent(formData: FormData) {
  const period = str(formData.get("period")) ?? periodKey();
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return;

  const leases = await prisma.lease.findMany({
    where: { status: { in: ["ACTIVE", "NOTICE"] }, rentAmount: { gt: 0 } },
    include: { charges: { where: { period, type: "RENT" }, select: { id: true } } },
  });

  const toPost = leases.filter((l) => l.charges.length === 0);
  if (toPost.length > 0) {
    await prisma.charge.createMany({
      data: toPost.map((l) => ({
        leaseId: l.id,
        type: "RENT",
        description: "Monthly rent",
        amount: l.rentAmount,
        dueDate: new Date(y, m - 1, Math.min(l.rentDueDay, 28)),
        period,
      })),
    });
  }
  refresh();
}

// Charge a late fee on every past-grace lease that still owes for the period
// and has not already been assessed one. Also idempotent.
export async function assessLateFees(formData: FormData) {
  const period = str(formData.get("period")) ?? periodKey();
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return;

  const leases = await prisma.lease.findMany({
    where: { status: { in: ["ACTIVE", "NOTICE"] }, lateFeeAmount: { gt: 0 } },
    include: { charges: true, payments: true },
  });

  const now = new Date();
  const due: { leaseId: string; amount: number; dueDate: Date }[] = [];
  for (const l of leases) {
    const alreadyAssessed = l.charges.some(
      (c) => c.period === period && c.type === "LATE_FEE",
    );
    if (alreadyAssessed) continue;

    const rentCharge = l.charges.find((c) => c.period === period && c.type === "RENT");
    if (!rentCharge) continue;

    const graceEnds = new Date(rentCharge.dueDate);
    graceEnds.setDate(graceEnds.getDate() + l.lateFeeAfterDay);
    if (now <= graceEnds) continue;

    const balance =
      l.charges.reduce((s, c) => s + c.amount, 0) -
      l.payments.reduce((s, p) => s + p.amount, 0);
    if (balance <= 0) continue;

    due.push({ leaseId: l.id, amount: l.lateFeeAmount, dueDate: now });
  }

  if (due.length > 0) {
    await prisma.charge.createMany({
      data: due.map((d) => ({
        leaseId: d.leaseId,
        type: "LATE_FEE",
        description: "Late fee",
        amount: d.amount,
        dueDate: d.dueDate,
        period,
      })),
    });
  }
  refresh();
}

// --- Vendors ----------------------------------------------------------------

export async function createVendor(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;
  await prisma.vendor.create({
    data: {
      name,
      trade: str(formData.get("trade")) ?? "GENERAL",
      contactName: str(formData.get("contactName")),
      email: str(formData.get("email")),
      phone: str(formData.get("phone")),
      hourlyRate: formData.get("hourlyRate") ? flt(formData.get("hourlyRate")) : null,
      insuredUntil: date(formData.get("insuredUntil")),
      w9OnFile: formData.get("w9OnFile") === "on",
      notes: str(formData.get("notes")),
    },
  });
  refresh();
}

export async function deleteVendor(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  await prisma.vendor.delete({ where: { id } });
  refresh();
}

// --- Work orders ------------------------------------------------------------

export async function createWorkOrder(formData: FormData) {
  const propertyId = str(formData.get("propertyId"));
  const title = str(formData.get("title"));
  if (!propertyId || !title) return;
  const vendorId = str(formData.get("vendorId"));
  await prisma.workOrder.create({
    data: {
      propertyId,
      unitId: str(formData.get("unitId")),
      vendorId,
      title,
      description: str(formData.get("description")),
      category: str(formData.get("category")) ?? "GENERAL",
      priority: str(formData.get("priority")) ?? "NORMAL",
      status: vendorId ? "ASSIGNED" : "OPEN",
      scheduledFor: date(formData.get("scheduledFor")),
      estimatedCost: formData.get("estimatedCost")
        ? flt(formData.get("estimatedCost"))
        : null,
      billToTenant: formData.get("billToTenant") === "on",
      notes: str(formData.get("notes")),
    },
  });
  refresh([`/properties/${propertyId}`]);
}

export async function updateWorkOrderStatus(formData: FormData) {
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  const wo = await prisma.workOrder.update({
    where: { id },
    data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
  });
  refresh([`/properties/${wo.propertyId}`]);
}

// Close a work order, book the cost as a property expense, and rebill the
// tenant when the work order was marked billable.
export async function completeWorkOrder(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const actualCost = flt(formData.get("actualCost"));

  const wo = await prisma.workOrder.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date(), actualCost },
    include: { unit: { include: { leases: { where: { status: "ACTIVE" } } } } },
  });

  if (actualCost > 0) {
    await prisma.expense.create({
      data: {
        propertyId: wo.propertyId,
        unitId: wo.unitId,
        vendorId: wo.vendorId,
        workOrderId: wo.id,
        category: wo.category === "TURNOVER" ? "TURNOVER" : "REPAIRS",
        description: wo.title,
        amount: actualCost,
        paidAt: new Date(),
      },
    });

    const activeLease = wo.unit?.leases[0];
    if (wo.billToTenant && activeLease) {
      await prisma.charge.create({
        data: {
          leaseId: activeLease.id,
          type: "REPAIR",
          description: `Repair rebill: ${wo.title}`,
          amount: actualCost,
          dueDate: new Date(),
          period: periodKey(),
        },
      });
    }
  }
  refresh([`/properties/${wo.propertyId}`]);
}

export async function deleteWorkOrder(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const wo = await prisma.workOrder.delete({ where: { id } });
  refresh([`/properties/${wo.propertyId}`]);
}

// --- Expenses ---------------------------------------------------------------

export async function createExpense(formData: FormData) {
  const propertyId = str(formData.get("propertyId"));
  const paidAt = date(formData.get("paidAt"));
  if (!propertyId || !paidAt) return;
  await prisma.expense.create({
    data: {
      propertyId,
      unitId: str(formData.get("unitId")),
      vendorId: str(formData.get("vendorId")),
      category: str(formData.get("category")) ?? "REPAIRS",
      description: str(formData.get("description")),
      amount: flt(formData.get("amount")),
      paidAt,
      notes: str(formData.get("notes")),
    },
  });
  refresh([`/properties/${propertyId}`]);
}

export async function deleteExpense(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const expense = await prisma.expense.delete({ where: { id } });
  refresh([`/properties/${expense.propertyId}`]);
}
