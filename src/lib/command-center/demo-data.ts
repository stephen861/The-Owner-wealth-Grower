// The one demo dataset for the Command Center prototype.
//
// Every value here is invented. Names are prefixed DEMO or marked FICTIONAL,
// addresses use reserved example street names, emails use the reserved
// .invalid TLD, and phone numbers use the 555-01xx reserved block. No field
// carries clinical, medical, eligibility, date-of-birth or payment-instrument
// data, and nothing is copied from any live base.
//
// Row counts intentionally mirror the audited source shape so the prototype
// behaves at realistic scale:
//   RCF Properties 7 · Residents 4 · FGW Properties 29 · RCF Checklist 49
//   FGW Tasks 32 · SOP Reference 7 · Contacts 126 · Money Log 147
//   Advances 2 · Jobs 12 · Furnishing & Supplies 73 · Work Orders 37
// Mirroring the COUNT is not a claim that any row matches a real one.

export const DEMO_DATASET_NAME = "Demo dataset v1 (synthetic)";

export const AUDITED_SOURCE_COUNTS = {
  "RCF Properties": 7,
  Residents: 4,
  "FGW Properties": 29,
  "RCF Checklist Items": 49,
  "FGW Tasks": 32,
  "SOP Reference": 7,
  Contacts: 126,
  "Money Log": 147,
  Advances: 2,
  Jobs: 12,
  "Furnishing & Supplies": 73,
  "Work Orders": 37,
} as const;

/** Deterministic PRNG so the demo dataset is identical on every reset. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const pick = <T,>(rng: () => number, list: readonly T[]): T =>
  list[Math.floor(rng() * list.length) % list.length];

const EXAMPLE_STREETS = [
  "Example Way",
  "Sample Street",
  "Placeholder Lane",
  "Testing Terrace",
  "Fictional Drive",
] as const;

const DEMO_CITIES = [
  ["Demo City", "ZZ"],
  ["Sampleton", "ZZ"],
  ["Placeholderville", "ZZ"],
] as const;

const AFLH_NAMES = [
  "Alder Court",
  "Birch House",
  "Cedar Place",
  "Dogwood Home",
  "Elm Residence",
  "Fir Cottage",
  "Gingko Lodge",
] as const;

const FGW_NAMES = [
  "Acorn", "Beacon", "Cobble", "Draper", "Edgewood", "Fallow", "Granite",
  "Harbor", "Ivy", "Juniper", "Kestrel", "Lantern", "Marlow", "Nettle",
  "Oriole", "Pebble", "Quarry", "Rowan", "Sable", "Tamarind", "Umber",
  "Vesper", "Willow", "Yarrow", "Zephyr", "Anchor", "Bramble", "Clover",
  "Dover",
] as const;

function addressFor(rng: () => number, n: number) {
  const [city, state] = pick(rng, DEMO_CITIES);
  return {
    addressLine: `${100 + n * 7} ${pick(rng, EXAMPLE_STREETS)}`,
    city,
    state,
  };
}

// Rows carrying a deliberate inconsistency, so the prototype's mismatch
// warnings and gates are visible in the UI rather than only in tests.
//
// Probe source IDs are RESOLVED FROM the generated rows rather than written
// out by hand, so they can never drift from the data they point at.
export type DemoProbes = {
  /** Facility whose raw status is a case/space variant — must NOT warn. */
  rawVariantNoWarning: string;
  /** Facility whose raw status maps to a different typed status. */
  rawMismatch: string;
  /** Facility whose eligibility flag contradicts its typed status. */
  eligibilityMismatch: string;
  /** Facility paid over its expected fees — reports as CREDIT. */
  feeCredit: string;
  /** Facility with no expected fee configured. */
  feeNotConfigured: string;
  /** Job whose spend exceeds its approved amount. */
  overApprovedJob: string;
  /** Job that is blocked, so approval must be refused. */
  blockedJob: string;
  /** Referral that is blocked and cannot advance. */
  blockedReferral: string;
  /** Work order recorded as approved while still blocked. */
  approvedWhileBlocked: string;
};

export type DemoDataset = ReturnType<typeof buildDemoDataset>;

export function buildDemoDataset(now: Date = new Date()) {
  const rng = makeRng(20_261_115);
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3_600_000);

  // --- Properties: 7 AFLH facilities + 29 FGW properties ------------------
  const properties = [
    ...AFLH_NAMES.map((name, i) => {
      const sourceId = `AFLH-P-${String(i + 1).padStart(3, "0")}`;
      const isRawVariant = i === 1;
      const isRawMismatch = i === 3;
      const isEligibilityMismatch = i === 4;
      const isFeeNotConfigured = i === 5;
      // Spread the license states, including the deliberate probes.
      let licenseStatus = "LICENSED";
      let licenseStatusRaw: string | null = "Licensed";
      let revenueEligible = true;

      if (isRawVariant) {
        // A spacing/case variant that the source base would have mis-gated.
        licenseStatusRaw = "  licensed  ";
      } else if (isRawMismatch) {
        // Typed status and source string disagree -> mismatch warning.
        licenseStatus = "LICENSED";
        licenseStatusRaw = "License Pending";
      } else if (isEligibilityMismatch) {
        // Typed status says not eligible, flag says eligible -> warning.
        licenseStatus = "UNLICENSED";
        licenseStatusRaw = "Unlicensed";
        revenueEligible = true;
      } else if (i === 5) {
        licenseStatus = "PENDING_LICENSE";
        licenseStatusRaw = "Pending";
        revenueEligible = false;
      } else if (i === 6) {
        licenseStatus = "PROVISIONAL";
        licenseStatusRaw = "Provisional";
        revenueEligible = true;
      }

      // Per-property expected fees — deliberately NOT one shared constant.
      let expectedFeesCents = [65_000, 72_500, 65_000, 81_000, 65_000, 59_000, 90_000][i];
      if (isFeeNotConfigured) expectedFeesCents = 0;

      return {
        sourceId,
        division: "AFLH",
        name: `DEMO — ${name}`,
        ...addressFor(rng, i),
        licenseStatus,
        licenseStatusRaw,
        revenueEligible,
        expectedFeesCents,
        bedCapacity: 4 + (i % 3),
        notes: "Synthetic facility record. Not a real address or license.",
      };
    }),
    ...FGW_NAMES.map((name, i) => ({
      sourceId: `FGW-P-${String(i + 1).padStart(3, "0")}`,
      division: "FGW",
      name: `DEMO — ${name} Unit`,
      ...addressFor(rng, i + 10),
      licenseStatus: "NOT_APPLICABLE",
      licenseStatusRaw: "N/A",
      revenueEligible: false,
      expectedFeesCents: 0,
      bedCapacity: null as number | null,
      notes: "Synthetic rental record.",
    })),
  ];

  const aflhIds = properties.filter((p) => p.division === "AFLH").map((p) => p.sourceId);
  const fgwIds = properties.filter((p) => p.division === "FGW").map((p) => p.sourceId);

  // --- RCF checklist items: 49 across the 7 AFLH facilities ---------------
  const CHECKLIST_LABELS = [
    ["Smoke alarms tested", "SAFETY"],
    ["Fire extinguisher serviced", "SAFETY"],
    ["Egress route documented", "SAFETY"],
    ["House rules posted", "DOCUMENTATION"],
    ["Emergency contact sheet posted", "DOCUMENTATION"],
    ["Bedroom furnishings complete", "FURNISHING"],
    ["Annual inspection booked", "INSPECTION"],
  ] as const;

  const checklistItems = aflhIds.flatMap((propertySourceId, p) =>
    CHECKLIST_LABELS.map(([label, category], c) => {
      const n = p * CHECKLIST_LABELS.length + c;
      // Mostly complete, with a scatter of in-progress and blocked items.
      let status = "COMPLETE";
      if (n % 11 === 3) status = "IN_PROGRESS";
      else if (n % 17 === 5) status = "BLOCKED";
      else if (n % 13 === 7) status = "NOT_STARTED";

      return {
        propertySourceId,
        sourceId: `AFLH-CL-${String(n + 1).padStart(3, "0")}`,
        label,
        category,
        required: category !== "FURNISHING",
        status,
        evidenceNote:
          status === "COMPLETE" ? "Photo filed in demo evidence folder." : null,
        blockedReason: status === "BLOCKED" ? "Awaiting vendor appointment." : null,
        completedAt: status === "COMPLETE" ? daysFromNow(-10 - (n % 30)) : null,
      };
    }),
  );

  // --- Placements: 4. Occupancy only, no personal or clinical detail ------
  const placements = [0, 1, 2, 3].map((i) => ({
    propertySourceId: aflhIds[i % aflhIds.length],
    sourceId: `AFLH-OCC-${String(i + 1).padStart(3, "0")}`,
    occupantCode: `DEMO-OCC-${String(i + 1).padStart(2, "0")}`,
    displayLabel: `Fictional Occupant ${String.fromCharCode(65 + i)}`,
    status: i === 3 ? "RESERVED" : "MOVED_IN",
    movedInAt: i === 3 ? null : daysFromNow(-60 - i * 20),
  }));

  // --- Referrals: administrative pipeline, spread across the six stages ---
  const STAGE_PLAN = [
    "RECEIVED",
    "RECEIVED",
    "FOLLOW_UP",
    "FOLLOW_UP",
    "DOCUMENTS_PENDING",
    "HUMAN_REVIEW",
    "HUMAN_REVIEW",
    "HUMAN_DECISION_RECORDED",
    "MOVE_IN_CHECKLIST",
  ] as const;

  const referrals = STAGE_PLAN.map((stage, i) => {
    const sourceId = `AFLH-R-${String(i + 1).padStart(3, "0")}`;
    const decided =
      stage === "HUMAN_DECISION_RECORDED" || stage === "MOVE_IN_CHECKLIST";
    const blocked = i === 3; // the blocked-referral probe
    return {
      sourceId,
      division: "AFLH",
      referralCode: `DEMO-REF-${String(i + 1).padStart(3, "0")}`,
      referrerLabel: `Demo Referral Source ${i + 1} (FICTIONAL)`,
      stage,
      propertySourceId: decided ? aflhIds[i % aflhIds.length] : null,
      decisionRecordedBy: decided ? "Demo Administrator (FICTIONAL)" : null,
      decisionNote: decided
        ? "Administrative decision recorded by a person. No clinical determination stored."
        : null,
      decisionAt: decided ? daysFromNow(-5 - i) : null,
      blocked,
      blockedReason: blocked ? "Required documents not legible — re-request." : null,
      receivedAt: daysFromNow(-30 + i * 2),
      notes: "Synthetic referral. Administrative tracking only.",
    };
  });

  // --- Contacts: 126 -----------------------------------------------------
  const CONTACT_ROLES = [
    "Referral coordinator",
    "Property contact",
    "Inspector",
    "Supplier rep",
    "Administrator",
  ] as const;

  const contacts = Array.from({ length: 126 }, (_, i) => ({
    sourceId: `CT-${String(i + 1).padStart(4, "0")}`,
    division: i % 3 === 0 ? "AFLH" : "FGW",
    displayName: `Demo Contact ${String(i + 1).padStart(3, "0")} (FICTIONAL)`,
    role: pick(rng, CONTACT_ROLES),
    org: `Demo Org ${String((i % 17) + 1).padStart(2, "0")} (FICTIONAL)`,
    phone: `555-01${String(i % 100).padStart(2, "0")}`,
    email: `contact${i + 1}@example.invalid`,
  }));

  // --- Vendors -----------------------------------------------------------
  const VENDOR_TRADES = [
    "PLUMBING", "ELECTRICAL", "HVAC", "GENERAL", "CLEANING", "LANDSCAPING",
  ] as const;

  const vendors = Array.from({ length: 8 }, (_, i) => ({
    sourceId: `VN-${String(i + 1).padStart(3, "0")}`,
    division: i % 4 === 0 ? "AFLH" : "FGW",
    name: `DEMO Vendor ${String(i + 1).padStart(2, "0")} (FICTIONAL)`,
    trade: VENDOR_TRADES[i % VENDOR_TRADES.length],
    phone: `555-02${String(i).padStart(2, "0")}`,
    notes: null as string | null,
  }));

  // --- Jobs: 12 ----------------------------------------------------------
  const JOB_TITLES = [
    "Repaint common area", "Replace flooring", "Rebuild back steps",
    "Service HVAC unit", "Re-key exterior doors", "Install grab rails",
    "Repair fence line", "Replace water heater", "Patch roof flashing",
    "Deep clean turnover", "Upgrade smoke alarms", "Landscape refresh",
  ] as const;

  // Source IDs are prefixed with the division they actually belong to, so a
  // prefix can never claim a division the row is not in.
  let fgwJobN = 0;
  let aflhJobN = 0;
  const jobs = JOB_TITLES.map((title, i) => {
    const division = i % 4 === 0 ? "AFLH" : "FGW";
    const n = division === "AFLH" ? (aflhJobN += 1) : (fgwJobN += 1);
    const sourceId = `${division}-J-${String(n).padStart(3, "0")}`;
    const quotedCents = 80_000 + i * 35_000;
    const isOverApproved = i === 2;
    const blocked = i === 7;
    return {
      sourceId,
      division,
      title: `DEMO — ${title}`,
      status: i < 3 ? "COMPLETE" : i < 7 ? "IN_PROGRESS" : i < 10 ? "APPROVED" : "PLANNED",
      quotedCents,
      // One job is deliberately approved for less than it will spend.
      approvedCents: isOverApproved ? 90_000 : quotedCents,
      isOverApproved,
      propertySourceId:
        division === "AFLH" ? aflhIds[i % aflhIds.length] : fgwIds[i % fgwIds.length],
      vendorSourceId: vendors[i % vendors.length].sourceId,
      blocked,
      blockedReason: blocked ? "Awaiting permit before work can start." : null,
    };
  });

  // --- Money log: 147 ----------------------------------------------------
  // Each row attaches through exactly one canonical FK per dimension.
  const moneyEntries: {
    sourceId: string;
    division: string;
    kind: string;
    amountCents: number;
    occurredAt: Date;
    memo: string | null;
    propertySourceId: string | null;
    jobSourceId: string | null;
    vendorSourceId: string | null;
  }[] = [];

  // 1. Fee payments against AFLH facilities, sized to hit each fee state.
  const feePlan: Record<string, number[]> = {
    "AFLH-P-001": [40_000, 25_000], // settles exactly to 65,000
    "AFLH-P-002": [30_000], // partially owed
    "AFLH-P-003": [50_000, 40_000], // 90,000 paid vs 65,000 expected -> CREDIT
    "AFLH-P-004": [81_000], // settled
    "AFLH-P-005": [20_000], // owed
    "AFLH-P-006": [15_000], // expected not configured -> credit, flagged
    "AFLH-P-007": [45_000], // owed
  };
  let moneyN = 0;
  for (const [propertySourceId, amounts] of Object.entries(feePlan)) {
    for (const amountCents of amounts) {
      moneyN += 1;
      moneyEntries.push({
        sourceId: `ML-${String(moneyN).padStart(4, "0")}`,
        division: "AFLH",
        kind: "FEE_PAYMENT",
        amountCents,
        occurredAt: daysFromNow(-20 - moneyN),
        memo: "Synthetic fee payment.",
        propertySourceId,
        jobSourceId: null,
        vendorSourceId: null,
      });
    }
  }

  // 2. Job spend. The over-approved job gets more than it was approved for.
  for (const job of jobs) {
    const installments = job.isOverApproved ? 3 : 2;
    const per = job.isOverApproved
      ? 50_000
      : Math.round((job.quotedCents * 0.6) / installments);
    for (let k = 0; k < installments; k++) {
      moneyN += 1;
      moneyEntries.push({
        sourceId: `ML-${String(moneyN).padStart(4, "0")}`,
        division: job.division,
        kind: "EXPENSE",
        amountCents: per,
        occurredAt: daysFromNow(-15 - k),
        memo: `Synthetic job spend (${job.title}).`,
        propertySourceId: job.propertySourceId,
        jobSourceId: job.sourceId,
        vendorSourceId: job.vendorSourceId,
      });
    }
  }

  // 3. Fill the remainder with supply purchases so the count matches 147.
  while (moneyEntries.length < 147) {
    moneyN += 1;
    const division = moneyN % 3 === 0 ? "AFLH" : "FGW";
    moneyEntries.push({
      sourceId: `ML-${String(moneyN).padStart(4, "0")}`,
      division,
      kind: "SUPPLY_PURCHASE",
      amountCents: 1_500 + (moneyN % 40) * 250,
      occurredAt: daysFromNow(-(moneyN % 90)),
      memo: "Synthetic supply purchase.",
      propertySourceId:
        division === "AFLH"
          ? aflhIds[moneyN % aflhIds.length]
          : fgwIds[moneyN % fgwIds.length],
      jobSourceId: null,
      vendorSourceId: vendors[moneyN % vendors.length].sourceId,
    });
  }

  // --- Advances: 2 -------------------------------------------------------
  const advances = [
    {
      sourceId: "ADV-001",
      division: "FGW",
      label: "DEMO — turnover float",
      amountCents: 150_000,
      repaidCents: 50_000,
      issuedAt: daysFromNow(-45),
      notes: "Synthetic advance.",
    },
    {
      sourceId: "ADV-002",
      division: "AFLH",
      label: "DEMO — furnishing float",
      amountCents: 90_000,
      repaidCents: 90_000,
      issuedAt: daysFromNow(-80),
      notes: "Synthetic advance, fully repaid.",
    },
  ];

  // --- Furnishing & supplies: 73 -----------------------------------------
  const SUPPLY_NAMES = [
    "Bed frame", "Mattress", "Dresser", "Dining chair", "Table lamp",
    "Smoke alarm", "Fire extinguisher", "Shower rail", "Linen set", "Kettle",
  ] as const;

  const supplyItems = Array.from({ length: 73 }, (_, i) => {
    const division = i % 3 === 0 ? "AFLH" : "FGW";
    return {
      sourceId: `FS-${String(i + 1).padStart(4, "0")}`,
      division,
      name: `DEMO ${SUPPLY_NAMES[i % SUPPLY_NAMES.length]}`,
      category:
        i % 5 === 0 ? "SAFETY" : i % 3 === 0 ? "APPLIANCE" : i % 2 === 0 ? "CONSUMABLE" : "FURNISHING",
      quantity: 1 + (i % 4),
      unitCostCents: 2_500 + (i % 30) * 900,
      propertySourceId:
        division === "AFLH"
          ? aflhIds[i % aflhIds.length]
          : fgwIds[i % fgwIds.length],
    };
  });

  // --- Work orders: 37, each with an explicit source ID ------------------
  const WO_TITLES = [
    "Leaking tap", "Blown bulb", "Door sticking", "No hot water",
    "Window latch broken", "Smoke alarm chirping", "Blocked drain",
    "Loose handrail",
  ] as const;

  let fgwWoN = 0;
  let aflhWoN = 0;
  const workOrders = Array.from({ length: 37 }, (_, i) => {
    const division = i % 4 === 0 ? "AFLH" : "FGW";
    const n = division === "AFLH" ? (aflhWoN += 1) : (fgwWoN += 1);
    const sourceId = `${division}-WO-${String(n).padStart(3, "0")}`;
    const status = i < 6 ? "OPEN" : i < 14 ? "ASSIGNED" : i < 22 ? "IN_PROGRESS" : "COMPLETE";
    const isApprovedWhileBlocked = i === 5;
    const blocked = isApprovedWhileBlocked || i === 11;
    return {
      sourceId,
      division,
      title: `DEMO — ${WO_TITLES[i % WO_TITLES.length]}`,
      category: VENDOR_TRADES[i % VENDOR_TRADES.length],
      priority: i === 2 ? "EMERGENCY" : i % 7 === 0 ? "HIGH" : "NORMAL",
      status,
      propertySourceId:
        division === "AFLH"
          ? aflhIds[i % aflhIds.length]
          : fgwIds[i % fgwIds.length],
      reportedAt: daysFromNow(-(i % 25) - 1),
      completedAt: status === "COMPLETE" ? daysFromNow(-(i % 10)) : null,
      estimateCents: 8_000 + (i % 12) * 4_500,
      actualCents: status === "COMPLETE" ? 9_000 + (i % 12) * 4_000 : null,
      blocked,
      blockedReason: blocked ? "Access not available — tenant contact pending." : null,
      isApprovedWhileBlocked,
    };
  });

  // --- FGW tasks: 32 -----------------------------------------------------
  const TASK_TITLES = [
    "Confirm inspection date", "Chase missing invoice", "File updated SOP",
    "Order replacement linens", "Schedule turnover clean", "Update contact sheet",
    "Review vendor quote", "Photograph completed work",
  ] as const;

  let fgwTaskN = 0;
  let aflhTaskN = 0;
  const tasks = Array.from({ length: 32 }, (_, i) => {
    const division = i % 3 === 0 ? "AFLH" : "FGW";
    const n = division === "AFLH" ? (aflhTaskN += 1) : (fgwTaskN += 1);
    const status = i < 10 ? "OPEN" : i < 18 ? "IN_PROGRESS" : i < 22 ? "BLOCKED" : "DONE";
    return {
      sourceId: `${division}-T-${String(n).padStart(3, "0")}`,
      division,
      title: `DEMO — ${TASK_TITLES[i % TASK_TITLES.length]}`,
      assignee: `Demo Staff ${String((i % 5) + 1).padStart(2, "0")} (FICTIONAL)`,
      status,
      priority: i % 9 === 0 ? "URGENT" : i % 4 === 0 ? "HIGH" : "NORMAL",
      dueAt: daysFromNow(-6 + (i % 21)),
      completedAt: status === "DONE" ? daysFromNow(-(i % 8)) : null,
      blockedReason: status === "BLOCKED" ? "Waiting on a vendor callback." : null,
      propertySourceId:
        division === "AFLH"
          ? aflhIds[i % aflhIds.length]
          : fgwIds[i % fgwIds.length],
    };
  });

  // --- SOP reference: 7 --------------------------------------------------
  const sopReferences = [
    "Referral intake handling",
    "Move-in checklist procedure",
    "Incident documentation",
    "Vendor dispatch and approval",
    "Monthly facility readiness review",
    "Supply reorder thresholds",
    "Record retention and access",
  ].map((title, i) => ({
    sourceId: `SOP-${String(i + 1).padStart(3, "0")}`,
    division: "AFLH",
    title: `DEMO — ${title}`,
    summary: "Synthetic placeholder summary. Not an operative procedure.",
    version: `v0.${i + 1}-demo`,
  }));

  // --- Agent check-ins ---------------------------------------------------
  const agentCheckIns = [
    {
      division: "AFLH",
      agentName: "DEMO Readiness Sweep",
      scope: "AFLH facility checklist review",
      lastCheckInAt: hoursFromNow(-2),
      lastEvidenceNote: "Read 49 synthetic checklist rows; 3 blocked items flagged.",
      blocked: false,
      blockedReason: null as string | null,
    },
    {
      division: "FGW",
      agentName: "DEMO Work Order Triage",
      scope: "FGW work order prioritisation",
      lastCheckInAt: hoursFromNow(-31),
      lastEvidenceNote: "Last run read 37 synthetic work orders.",
      blocked: false,
      blockedReason: null,
    },
    {
      division: "FGW",
      agentName: "DEMO Cost Reconciler",
      scope: "Money log to job matching",
      lastCheckInAt: hoursFromNow(-1),
      lastEvidenceNote: null,
      blocked: false,
      blockedReason: null,
    },
    {
      division: "AFLH",
      // Blocked, but its own note claims everything is fine. The UI reports
      // BLOCKED regardless of the note's wording.
      agentName: "DEMO Referral Notifier",
      scope: "Referral stage change alerts",
      lastCheckInAt: hoursFromNow(-6),
      lastEvidenceNote: "Reported 'all clear' — note contradicts the blocked flag below.",
      blocked: true,
      blockedReason: "No connected integration; nothing was actually sent.",
    },
    {
      division: "FGW",
      agentName: "DEMO Supply Watcher",
      scope: "Furnishing and supply thresholds",
      lastCheckInAt: null,
      lastEvidenceNote: null,
      blocked: false,
      blockedReason: null,
    },
  ];

  // --- Approval queue ----------------------------------------------------
  // Subjects are looked up from the generated rows, so an approval can never
  // point at a source ID that does not exist.
  const blockedJob = jobs.find((j) => j.blocked)!;
  const overApprovedJob = jobs.find((j) => j.isOverApproved)!;
  const clearJobs = jobs.filter((j) => !j.blocked && !j.isOverApproved);
  const approvedWhileBlockedWo = workOrders.find((w) => w.isApprovedWhileBlocked)!;

  const approvals = [
    {
      division: clearJobs[0].division,
      title: "DEMO — approve flooring replacement quote",
      subjectType: "JOB",
      subjectSourceId: clearJobs[0].sourceId,
      requestedBy: "Demo Staff 01 (FICTIONAL)",
      amountCents: 115_000,
      state: "PENDING",
      decidedBy: null as string | null,
      decisionNote: null as string | null,
      decidedAt: null as Date | null,
    },
    {
      division: blockedJob.division,
      // Subject is blocked: the gate refuses approval until the block clears.
      title: "DEMO — approve water heater replacement",
      subjectType: "JOB",
      subjectSourceId: blockedJob.sourceId,
      requestedBy: "Demo Staff 02 (FICTIONAL)",
      amountCents: 325_000,
      state: "PENDING",
      decidedBy: null,
      decisionNote: null,
      decidedAt: null,
    },
    {
      division: clearJobs[1].division,
      // Pending, but the note reads as an approval -> consistency warning.
      title: "DEMO — approve grab rail installation",
      subjectType: "JOB",
      subjectSourceId: clearJobs[1].sourceId,
      requestedBy: "Demo Staff 03 (FICTIONAL)",
      amountCents: 175_000,
      state: "PENDING",
      decidedBy: null,
      decisionNote: "Signed off verbally last week.",
      decidedAt: null,
    },
    {
      division: approvedWhileBlockedWo.division,
      // Already approved while its subject work order is blocked ->
      // the inconsistency the source base tolerated, surfaced here.
      title: "DEMO — approve access escalation",
      subjectType: "WORK_ORDER",
      subjectSourceId: approvedWhileBlockedWo.sourceId,
      requestedBy: "Demo Staff 01 (FICTIONAL)",
      amountCents: 12_000,
      state: "APPROVED",
      decidedBy: "Demo Administrator (FICTIONAL)",
      decisionNote: "Approved.",
      decidedAt: daysFromNow(-3),
    },
    {
      division: "AFLH",
      title: "DEMO — approve supply reorder",
      subjectType: "MONEY_ENTRY",
      subjectSourceId: "ML-0030",
      requestedBy: "Demo Staff 04 (FICTIONAL)",
      amountCents: 22_500,
      state: "REJECTED",
      decidedBy: "Demo Administrator (FICTIONAL)",
      decisionNote: "Deferred to next period.",
      decidedAt: daysFromNow(-9),
    },
  ];

  const probes: DemoProbes = {
    rawVariantNoWarning: properties[1].sourceId,
    rawMismatch: properties[3].sourceId,
    eligibilityMismatch: properties[4].sourceId,
    feeCredit: properties[2].sourceId,
    feeNotConfigured: properties[5].sourceId,
    overApprovedJob: overApprovedJob.sourceId,
    blockedJob: blockedJob.sourceId,
    blockedReferral: referrals.find((r) => r.blocked)!.sourceId,
    approvedWhileBlocked: approvedWhileBlockedWo.sourceId,
  };

  return {
    probes,
    properties,
    checklistItems,
    placements,
    referrals,
    contacts,
    vendors,
    jobs,
    moneyEntries,
    advances,
    supplyItems,
    workOrders,
    tasks,
    sopReferences,
    agentCheckIns,
    approvals,
  };
}

/**
 * A staged import batch that deliberately contains duplicate source IDs and
 * rows with no source ID. Used by the import-mapping screen to demonstrate
 * reconciliation. These rows are NEVER inserted — they are a preview fixture.
 */
export const DEMO_IMPORT_PREVIEW: {
  division: string;
  sourceId: string | null;
  title: string;
}[] = [
  { division: "FGW", sourceId: "FGW-WO-001", title: "DEMO — Leaking tap (first copy)" },
  { division: "FGW", sourceId: "FGW-WO-001", title: "DEMO — Leaking tap (duplicate)" },
  { division: "FGW", sourceId: " FGW-WO-001 ", title: "DEMO — Leaking tap (whitespace variant)" },
  { division: "FGW", sourceId: "FGW-WO-002", title: "DEMO — Blown bulb" },
  { division: "AFLH", sourceId: "FGW-WO-001", title: "DEMO — same ID, other division" },
  { division: "FGW", sourceId: "", title: "DEMO — row with no source ID" },
  { division: "FGW", sourceId: null, title: "DEMO — row with null source ID" },
];
