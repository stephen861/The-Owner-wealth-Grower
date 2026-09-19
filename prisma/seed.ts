import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear existing data (idempotent seed for local dev).
  await prisma.activity.deleteMany();
  await prisma.exchangeDeposit.deleteMany();
  await prisma.exchangeMembership.deleteMany();
  await prisma.fee.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.contact.deleteMany();
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

  // ---------------------------------------------------------------------
  // Client relationship layer: contacts, deals in flight, and follow-ups.
  // ---------------------------------------------------------------------

  const maria = await prisma.contact.create({
    data: {
      firstName: "Maria",
      lastName: "Ramirez",
      email: "maria.ramirez@example.com",
      phone: "(813) 555-0142",
      type: "CLIENT",
      status: "ACTIVE",
      source: "REFERRAL",
      city: "Tampa",
      state: "FL",
      tags: "family, repeat, spring-break",
      lastContactAt: inDays(-6),
      nextFollowUpAt: inDays(3),
      notes: "Books a 2BR every spring break. Prefers Orlando or the Gulf coast.",
    },
  });

  const chen = await prisma.contact.create({
    data: {
      firstName: "David",
      lastName: "Chen",
      email: "d.chen@example.com",
      phone: "(206) 555-0188",
      type: "LEAD",
      status: "QUALIFIED",
      source: "PRESENTATION",
      city: "Seattle",
      state: "WA",
      tags: "hawaii, anniversary",
      lastContactAt: inDays(-2),
      nextFollowUpAt: inDays(-1),
      notes: "25th anniversary trip to Maui. Budget around $9k, dates flexible.",
    },
  });

  const okafor = await prisma.contact.create({
    data: {
      firstName: "Grace",
      lastName: "Okafor",
      email: "grace.okafor@example.com",
      phone: "(404) 555-0119",
      type: "LEAD",
      status: "CONTACTED",
      source: "SOCIAL",
      city: "Atlanta",
      state: "GA",
      tags: "cruise",
      lastContactAt: inDays(-11),
      nextFollowUpAt: inDays(1),
      notes: "Asked about a Caribbean cruise through Westgate Cruise & Travel.",
    },
  });

  const bennett = await prisma.contact.create({
    data: {
      firstName: "Tom",
      lastName: "Bennett",
      company: "Bennett & Co. Realty",
      email: "tom@bennettrealty.example",
      phone: "(727) 555-0173",
      type: "PARTNER",
      status: "ACTIVE",
      source: "REFERRAL",
      city: "Clearwater",
      state: "FL",
      tags: "referral-partner",
      lastContactAt: inDays(-20),
      notes: "Sends 2-3 client referrals a quarter. Owed a thank-you dinner.",
    },
  });

  const mariaDeal = await prisma.deal.create({
    data: {
      contactId: maria.id,
      title: "Spring break 2BR — Bonnet Creek",
      stage: "WON",
      value: 3200,
      commissionRate: 12,
      probability: 100,
      expectedCloseAt: inDays(-14),
      closedAt: inDays(-14),
      notes: "Booked on Wyndham points, guest certificate issued.",
    },
  });

  const chenDeal = await prisma.deal.create({
    data: {
      contactId: chen.id,
      title: "Maui 10-night anniversary package",
      stage: "PROPOSAL",
      value: 9400,
      commissionRate: 10,
      probability: 60,
      expectedCloseAt: inDays(12),
      notes: "Quoted two Interval options plus a cash rate. Waiting on dates.",
    },
  });

  await prisma.deal.create({
    data: {
      contactId: okafor.id,
      title: "7-night Caribbean cruise — 2 cabins",
      stage: "QUALIFYING",
      value: 5600,
      commissionRate: 9,
      probability: 30,
      expectedCloseAt: inDays(40),
      notes: "Needs pricing for October sailings out of Miami.",
    },
  });

  await prisma.deal.create({
    data: {
      contactId: maria.id,
      title: "Summer Gulf coast week",
      stage: "NEGOTIATION",
      value: 4100,
      commissionRate: 12,
      probability: 75,
      expectedCloseAt: inDays(21),
      notes: "Comparing Marriott Ocean Pointe against a cash rate in Destin.",
    },
  });

  await prisma.activity.createMany({
    data: [
      {
        contactId: chen.id,
        dealId: chenDeal.id,
        type: "EMAIL",
        subject: "Sent Maui proposal with 3 options",
        body: "Interval exchange, points stay, and a cash rate for comparison.",
        done: true,
        doneAt: inDays(-2),
      },
      {
        contactId: chen.id,
        dealId: chenDeal.id,
        type: "CALL",
        subject: "Follow up on Maui proposal",
        body: "Confirm travel dates and whether they want the ocean-view upgrade.",
        dueAt: inDays(-1),
      },
      {
        contactId: okafor.id,
        type: "CALL",
        subject: "Send October cruise pricing",
        dueAt: inDays(1),
      },
      {
        contactId: maria.id,
        dealId: mariaDeal.id,
        type: "TASK",
        subject: "Confirm guest certificate for spring break stay",
        dueAt: inDays(3),
      },
      {
        contactId: maria.id,
        type: "MEETING",
        subject: "Reviewed 2027 travel plans over coffee",
        body: "Interested in an Alaska cruise next year.",
        done: true,
        doneAt: inDays(-6),
      },
      {
        contactId: bennett.id,
        type: "NOTE",
        subject: "Referred the Chen family",
        done: true,
        doneAt: inDays(-20),
      },
      {
        contactId: bennett.id,
        type: "TASK",
        subject: "Send Q3 referral thank-you gift",
        dueAt: inDays(9),
      },
    ],
  });

  // Attach the won deal's stay to the client so commission shows on the trip.
  const springBreak = await prisma.reservation.findFirst({
    orderBy: { checkIn: "asc" },
  });
  if (springBreak) {
    await prisma.reservation.update({
      where: { id: springBreak.id },
      data: {
        contactId: maria.id,
        dealId: mariaDeal.id,
        clientCharge: 3200,
        commission: 384,
      },
    });
  }

  console.log(
    "✅ Seeded sample contacts, deals, activities, timeshares, points, benefits, reservations and fees.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
