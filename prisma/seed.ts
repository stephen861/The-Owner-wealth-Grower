import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear existing data (idempotent seed for local dev).
  await prisma.exchangeDeposit.deleteMany();
  await prisma.exchangeMembership.deleteMany();
  await prisma.fee.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.benefit.deleteMany();
  await prisma.pointsAccount.deleteMany();
  await prisma.timeshare.deleteMany();

  const year = new Date().getFullYear();
  // Helper: a date N days from now (for demo renewal/expiry windows).
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  const wyndham = await prisma.timeshare.create({
    data: {
      name: "Club Wyndham Bonnet Creek",
      brand: "Wyndham",
      resort: "Club Wyndham Bonnet Creek",
      location: "Orlando, FL",
      ownershipType: "POINTS",
      contractNumber: "CW-8841902",
      memberNumber: "100482211",
      unitType: "2BR Deluxe",
      annualPoints: 154000,
      useYear: "ANNUAL",
      purchaseDate: new Date("2019-06-14"),
      purchasePrice: 22000,
      notes: "Club Wyndham Plus points membership. Platinum VIP tier.",
      pointsAccounts: {
        create: [
          {
            useYear: year,
            allotted: 154000,
            used: 42000,
            banked: 0,
            borrowed: 0,
            expiresAt: new Date(`${year}-12-31`),
          },
          {
            useYear: year + 1,
            allotted: 154000,
            used: 0,
            banked: 50000,
            borrowed: 0,
          },
        ],
      },
      benefits: {
        create: [
          {
            name: "Guest Confirmations",
            category: "PERK",
            tier: "Platinum VIP",
            description: "Unlimited free guest confirmations at Platinum tier.",
            totalAllowance: null,
            usedAllowance: 0,
          },
          {
            name: "Reservation Transactions",
            category: "PERK",
            tier: "Platinum VIP",
            description: "Free reservation transactions.",
            totalAllowance: null,
            usedAllowance: 0,
          },
          {
            name: "Unit Size Upgrades",
            category: "UPGRADE",
            tier: "Platinum VIP",
            description: "Automatic upgrade within 60 days when available.",
            totalAllowance: null,
            usedAllowance: 0,
          },
        ],
      },
    },
  });

  const marriott = await prisma.timeshare.create({
    data: {
      name: "Marriott's Grande Vista",
      brand: "Marriott / Abound",
      resort: "Marriott's Grande Vista",
      location: "Orlando, FL",
      ownershipType: "DEEDED_WEEK",
      contractNumber: "MVC-552310",
      deededWeek: "Week 12",
      unitType: "2BR Villa",
      annualPoints: 3725,
      useYear: "ANNUAL",
      purchaseDate: new Date("2016-03-02"),
      purchasePrice: 18500,
      notes: "Enrolled in Abound by Marriott Vacations (points program).",
      pointsAccounts: {
        create: [
          {
            useYear: year,
            allotted: 3725,
            used: 0,
            banked: 0,
            borrowed: 0,
            expiresAt: new Date(`${year}-12-31`),
          },
        ],
      },
      benefits: {
        create: [
          {
            name: "Abound Club Points",
            category: "TIER",
            tier: "Select",
            description: "Trade deeded week for Abound club points.",
          },
        ],
      },
    },
  });

  const westgate = await prisma.timeshare.create({
    data: {
      name: "Westgate Lakes Resort & Spa",
      brand: "Westgate",
      resort: "Westgate Lakes Resort & Spa",
      location: "Orlando, FL",
      ownershipType: "DEEDED_WEEK",
      contractNumber: "WG-220194",
      memberNumber: "WG-77310",
      deededWeek: "Week 26 (floating summer)",
      unitType: "2BR Villa",
      useYear: "ANNUAL",
      purchaseDate: new Date("2014-07-21"),
      purchasePrice: 15900,
      notes: "Deeded week, deposited annually into RCI. Member of Westgate Cruise & Travel.",
      pointsAccounts: {
        create: [
          {
            useYear: year,
            allotted: 0,
            used: 0,
            banked: 0,
            borrowed: 0,
          },
        ],
      },
    },
  });

  // Exchange networks & travel memberships
  const rci = await prisma.exchangeMembership.create({
    data: {
      name: "RCI Weeks",
      network: "RCI",
      memberNumber: "5012-998143",
      tier: "RCI Platinum",
      timeshareId: westgate.id,
      joinDate: new Date("2014-08-01"),
      expiresAt: new Date(`${year + 2}-08-01`),
      membershipFee: 154,
      notes: "Westgate week deposited here each year for exchanges.",
    },
  });

  const interval = await prisma.exchangeMembership.create({
    data: {
      name: "Interval International",
      network: "INTERVAL",
      memberNumber: "II-44120897",
      tier: "Interval Gold",
      timeshareId: marriott.id,
      joinDate: new Date("2016-03-05"),
      expiresAt: new Date(`${year + 1}-03-05`),
      membershipFee: 89,
      notes: "Marriott Grande Vista enrolled for II exchanges.",
    },
  });

  await prisma.exchangeMembership.create({
    data: {
      name: "Westgate Cruise & Travel Collection",
      network: "WESTGATE_TRAVEL",
      memberNumber: "WCT-330451",
      tier: "Preferred",
      timeshareId: westgate.id,
      joinDate: new Date("2018-01-15"),
      membershipFee: 199,
      notes: "Discounted cruises and travel benefits through Westgate.",
    },
  });

  // Warehouse-club travel memberships (no deposits — rewards & credits instead)
  await prisma.exchangeMembership.create({
    data: {
      name: "Costco Travel",
      network: "COSTCO_TRAVEL",
      memberNumber: "1119-22334455",
      tier: "Executive",
      joinDate: new Date("2012-05-01"),
      expiresAt: inDays(40),
      membershipFee: 130,
      notes: "Executive membership — 2% reward on Costco Travel packages plus member savings.",
      perks: {
        create: [
          {
            name: "Executive 2% Reward",
            category: "REWARD",
            value: 312.4,
            used: 0,
            notes: "2% annual reward accrued on travel & warehouse purchases.",
          },
          {
            name: "Digital Costco Shop Card",
            category: "CREDIT",
            value: 200,
            used: 0,
            expiresAt: inDays(25),
            notes: "Included with Hawaii package booking.",
          },
        ],
      },
    },
  });

  await prisma.exchangeMembership.create({
    data: {
      name: "Sam's Club Travel",
      network: "SAMS_TRAVEL",
      memberNumber: "101-998877665",
      tier: "Plus",
      joinDate: new Date("2019-02-10"),
      expiresAt: inDays(95),
      membershipFee: 110,
      notes: "Plus membership — Sam's Cash on travel bookings via Sam's Club Travel.",
      perks: {
        create: [
          {
            name: "Sam's Cash (travel)",
            category: "REWARD",
            value: 85.5,
            used: 25,
            notes: "Sam's Cash earned on travel and eligible purchases.",
          },
        ],
      },
    },
  });

  // Deposits / trade credits sitting in the exchanges
  await prisma.exchangeDeposit.createMany({
    data: [
      {
        membershipId: rci.id,
        timeshareId: westgate.id,
        depositType: "WEEK",
        description: `${year} Week 26 — Westgate Lakes 2BR`,
        tradingPower: 38,
        depositDate: new Date(`${year - 1}-09-01`),
        expiresAt: new Date(`${year + 1}-09-01`),
        status: "AVAILABLE",
      },
      {
        membershipId: rci.id,
        timeshareId: westgate.id,
        depositType: "WEEK",
        description: `${year - 1} Week 26 — Westgate Lakes 2BR`,
        tradingPower: 31,
        depositDate: new Date(`${year - 2}-09-01`),
        expiresAt: new Date(`${year}-08-15`),
        status: "AVAILABLE",
      },
      {
        membershipId: interval.id,
        timeshareId: marriott.id,
        depositType: "WEEK",
        description: `${year} Week 12 — Marriott Grande Vista 2BR`,
        tradingPower: 42,
        depositDate: new Date(`${year}-01-10`),
        expiresAt: new Date(`${year + 2}-01-10`),
        status: "AVAILABLE",
      },
    ],
  });

  // Reservations
  await prisma.reservation.createMany({
    data: [
      {
        timeshareId: wyndham.id,
        resort: "Club Wyndham Bonnet Creek",
        location: "Orlando, FL",
        checkIn: new Date(`${year}-08-15`),
        checkOut: new Date(`${year}-08-22`),
        guests: 4,
        unitType: "2BR Deluxe",
        confirmationNumber: "WYN-7782341",
        pointsUsed: 98000,
        status: "CONFIRMED",
      },
      {
        timeshareId: marriott.id,
        resort: "Marriott's Grande Vista",
        location: "Orlando, FL",
        checkIn: new Date(`${year}-03-19`),
        checkOut: new Date(`${year}-03-26`),
        guests: 2,
        unitType: "2BR Villa",
        confirmationNumber: "MVC-4419023",
        pointsUsed: 0,
        status: "COMPLETED",
      },
      {
        timeshareId: wyndham.id,
        resort: "Club Wyndham Skyline Tower",
        location: "Atlantic City, NJ",
        checkIn: new Date(`${year}-12-27`),
        checkOut: new Date(`${year}-12-31`),
        guests: 3,
        unitType: "1BR Suite",
        pointsUsed: 56000,
        status: "PLANNED",
        guestName: "Smith family",
      },
    ],
  });

  // Fees
  await prisma.fee.createMany({
    data: [
      {
        timeshareId: wyndham.id,
        type: "MAINTENANCE",
        description: `${year} annual program fees & assessments`,
        amount: 1284.5,
        dueDate: new Date(`${year}-01-15`),
        recurrence: "ANNUAL",
        paid: true,
        paidDate: new Date(`${year}-01-10`),
      },
      {
        timeshareId: marriott.id,
        type: "MAINTENANCE",
        description: `${year} annual maintenance fee`,
        amount: 1410.0,
        dueDate: new Date(`${year}-09-30`),
        recurrence: "ANNUAL",
        paid: false,
      },
      {
        timeshareId: wyndham.id,
        type: "SPECIAL_ASSESSMENT",
        description: "Roof & facade renovation assessment",
        amount: 320.0,
        dueDate: new Date(`${year}-07-01`),
        recurrence: "ONCE",
        paid: false,
      },
    ],
  });

  console.log("✅ Seeded sample timeshares, points, benefits, reservations and fees.");

  await seedLeasing(inDays);
}

// FGW affordable-housing leasing demo data. Income limits below are SAMPLE
// figures — replace with your area's current HUD / state agency table.
async function seedLeasing(inDays: (n: number) => Date) {
  await prisma.message.deleteMany();
  await prisma.tour.deleteMany();
  await prisma.prospect.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.incomeLimit.deleteMany();
  await prisma.property.deleteMany();

  const year = new Date().getFullYear();
  const limits60 = [45360, 51840, 58320, 64740, 69960, 75120, 80340, 85500];
  const limitRows = (propertyId: string) =>
    [30, 50, 60].flatMap((ami) =>
      limits60.map((max, i) => ({
        propertyId,
        amiPercent: ami,
        householdSize: i + 1,
        maxIncome: Math.round((max * ami) / 60),
        year,
      })),
    );

  const oaks = await prisma.property.create({
    data: {
      name: "FGW Oak Terrace Apartments",
      address: "1200 Oak Terrace Blvd",
      city: "Atlanta",
      state: "GA",
      program: "LIHTC",
      acceptsVouchers: true,
      officePhone: "(555) 010-0101",
      officeHours: "Mon–Fri 9am–5pm, Sat 10am–2pm",
      amenities: "On-site laundry, playground, community room, computer lab, bus line at entrance, free parking",
      policies:
        "Cats and dogs under 40 lb allowed ($25/mo pet rent; assistance animals are not pets and have no fee). Water/trash included. Screening: no evictions in last 3 years; credit is reviewed but not a sole reason to deny. All adult household members must apply.",
      applicationUrl: "https://example.com/fgw/apply/oak-terrace",
      applicationFee: 35,
      minIncomeMultiple: 2,
    },
  });
  const maple = await prisma.property.create({
    data: {
      name: "FGW Maple Commons Senior & Family",
      address: "88 Maple Commons Way",
      city: "Decatur",
      state: "GA",
      program: "MIXED",
      acceptsVouchers: true,
      officePhone: "(555) 010-0102",
      officeHours: "Mon–Fri 8:30am–4:30pm",
      amenities: "Elevator, fitness room, garden plots, after-school program, in-unit washer/dryer in 2-3BR",
      policies: "No pets except assistance animals. Tenant pays electric. Application fee waived for voucher holders.",
      applicationUrl: "https://example.com/fgw/apply/maple-commons",
      applicationFee: 25,
      minIncomeMultiple: 2.5,
    },
  });
  await prisma.incomeLimit.createMany({ data: [...limitRows(oaks.id), ...limitRows(maple.id)] });

  await prisma.unit.createMany({
    data: [
      { propertyId: oaks.id, unitNumber: "A-104", bedrooms: 1, bathrooms: 1, sqft: 680, rent: 865, amiPercent: 50, accessible: true },
      { propertyId: oaks.id, unitNumber: "B-210", bedrooms: 2, bathrooms: 1, sqft: 910, rent: 1040, amiPercent: 60 },
      { propertyId: oaks.id, unitNumber: "B-305", bedrooms: 2, bathrooms: 1, sqft: 910, rent: 615, amiPercent: 30, availableDate: inDays(21) },
      { propertyId: oaks.id, unitNumber: "C-112", bedrooms: 3, bathrooms: 2, sqft: 1180, rent: 1195, amiPercent: 60 },
      { propertyId: oaks.id, unitNumber: "C-118", bedrooms: 3, bathrooms: 2, sqft: 1180, rent: 1195, amiPercent: 60, status: "LEASED" },
      { propertyId: maple.id, unitNumber: "101", bedrooms: 0, bathrooms: 1, sqft: 480, rent: 720, amiPercent: 50 },
      { propertyId: maple.id, unitNumber: "214", bedrooms: 1, bathrooms: 1, sqft: 700, rent: 980, amiPercent: 60, accessible: true },
      { propertyId: maple.id, unitNumber: "330", bedrooms: 2, bathrooms: 2, sqft: 1010, rent: 1650, amiPercent: 0, availableDate: inDays(10) },
    ],
  });

  const maria = await prisma.prospect.create({
    data: {
      name: "Maria",
      phone: "+15555550123",
      source: "SMS",
      preferredLanguage: "es",
      householdSize: 3,
      annualIncome: 42000,
      hasVoucher: false,
      bedroomsWanted: 2,
      propertyId: oaks.id,
      status: "TOUR_SCHEDULED",
      lastMessageAt: inDays(-1),
    },
  });
  const ago = (h: number) => new Date(Date.now() - h * 3600_000);
  await prisma.message.createMany({
    data: [
      { prospectId: maria.id, direction: "IN", author: "PROSPECT", channel: "SMS", body: "Hola, tienen apartamentos de 2 recámaras?", createdAt: ago(26) },
      { prospectId: maria.id, direction: "OUT", author: "AGENT", channel: "SMS", body: "¡Hola! Sí, en FGW Oak Terrace tenemos 2 recámaras desde $615/mes (unidad de 30% AMI, disponible en 3 semanas) y $1,040/mes (60% AMI, disponible ya). ¿Cuántas personas vivirán en el hogar y cuál es el ingreso anual total del hogar?", createdAt: ago(26) },
      { prospectId: maria.id, direction: "IN", author: "PROSPECT", channel: "SMS", body: "Somos 3, ganamos como 42 mil al año. No tengo voucher", createdAt: ago(25.9) },
      { prospectId: maria.id, direction: "OUT", author: "AGENT", channel: "SMS", body: "¡Gracias! Según nuestra pre-evaluación, su hogar pre-califica para la unidad B-210 ($1,040) (la B-305 no aplica porque su ingreso supera el límite de 30% AMI). Esto está sujeto a verificación. ¿Le gustaría agendar una visita?", createdAt: ago(25.9) },
    ],
  });
  const tourAt = inDays(2);
  tourAt.setHours(11, 0, 0, 0);
  await prisma.tour.create({ data: { prospectId: maria.id, propertyId: oaks.id, scheduledAt: tourAt, type: "IN_PERSON" } });

  const web = await prisma.prospect.create({
    data: {
      webSessionId: "demo-session-0000000001",
      source: "WEB",
      needsHuman: true,
      escalationReason: "Reasonable accommodation request (assistance animal)",
      lastMessageAt: ago(2),
    },
  });
  await prisma.message.createMany({
    data: [
      { prospectId: web.id, direction: "IN", author: "PROSPECT", channel: "WEB", body: "Do you allow emotional support animals at Maple Commons? I have documentation.", createdAt: ago(2) },
      { prospectId: web.id, direction: "OUT", author: "AGENT", channel: "WEB", body: "Thank you for asking — we're happy to help with reasonable accommodation requests. Assistance animals are not considered pets. I've passed this to a member of our team, who will follow up with you during office hours to walk you through the process. You can also call (555) 010-0100.", createdAt: ago(2) },
    ],
  });

  console.log("✅ Seeded FGW leasing: 2 properties, 8 units, income limits, 2 demo conversations.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
