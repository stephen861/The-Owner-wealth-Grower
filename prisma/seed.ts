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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
