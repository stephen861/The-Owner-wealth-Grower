import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear existing data (idempotent seed for local dev).
  await prisma.activity.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.charge.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.property.deleteMany();
  await prisma.vendor.deleteMany();
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

  // ---------------------------------------------------------------------
  // Property management: properties, units, leases, ledger, maintenance.
  // ---------------------------------------------------------------------

  const monthKey = (offset: number) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      first: new Date(d.getFullYear(), d.getMonth(), 1),
    };
  };

  // An owner whose properties you manage for a fee.
  const patel = await prisma.contact.create({
    data: {
      firstName: "Anil",
      lastName: "Patel",
      email: "anil.patel@example.com",
      phone: "(813) 555-0166",
      type: "OWNER",
      status: "ACTIVE",
      source: "REFERRAL",
      city: "Tampa",
      state: "FL",
      tags: "owner, out-of-state",
      notes: "Owns three doors in Seminole Heights. Wants monthly statements by the 5th.",
    },
  });

  // Tenants.
  const tenantData = [
    { firstName: "Jasmine", lastName: "Carter", phone: "(813) 555-0210" },
    { firstName: "Marcus", lastName: "Webb", phone: "(813) 555-0233" },
    { firstName: "Elena", lastName: "Vasquez", phone: "(727) 555-0298" },
    { firstName: "Derrick", lastName: "Hall", phone: "(813) 555-0311" },
  ];
  const tenants = [];
  for (const t of tenantData) {
    tenants.push(
      await prisma.contact.create({
        data: {
          ...t,
          email: `${t.firstName.toLowerCase()}.${t.lastName.toLowerCase()}@example.com`,
          type: "TENANT",
          status: "ACTIVE",
          city: "Tampa",
          state: "FL",
        },
      }),
    );
  }

  const vendors = await Promise.all([
    prisma.vendor.create({
      data: {
        name: "Gulf Coast Plumbing",
        trade: "PLUMBING",
        contactName: "Ray Dunn",
        phone: "(813) 555-0455",
        email: "dispatch@gulfcoastplumbing.example",
        hourlyRate: 95,
        insuredUntil: inDays(240),
        w9OnFile: true,
      },
    }),
    prisma.vendor.create({
      data: {
        name: "Bay Area HVAC",
        trade: "HVAC",
        contactName: "Tina Cole",
        phone: "(813) 555-0477",
        hourlyRate: 110,
        insuredUntil: inDays(21),
        w9OnFile: true,
        notes: "Insurance certificate expires soon — request an updated COI.",
      },
    }),
    prisma.vendor.create({
      data: {
        name: "Sunshine Turnovers",
        trade: "CLEANING",
        phone: "(813) 555-0488",
        hourlyRate: 45,
        w9OnFile: false,
        notes: "Fast on turns, but no W-9 on file yet.",
      },
    }),
  ]);

  // A self-owned duplex and a managed fourplex.
  const duplex = await prisma.property.create({
    data: {
      name: "Maple Street Duplex",
      addressLine1: "1420 Maple St",
      city: "Tampa",
      state: "FL",
      zip: "33604",
      type: "MULTI_FAMILY",
      managementFeeRate: 0,
      purchaseDate: new Date("2021-04-08"),
      purchasePrice: 268000,
      marketValue: 395000,
      mortgageBalance: 191000,
      notes: "Self-owned. Roof replaced 2023.",
      units: {
        create: [
          { label: "A", beds: 2, baths: 1, sqft: 900, marketRent: 1650, status: "OCCUPIED" },
          { label: "B", beds: 2, baths: 1, sqft: 900, marketRent: 1650, status: "OCCUPIED" },
        ],
      },
    },
    include: { units: { orderBy: { label: "asc" } } },
  });

  const fourplex = await prisma.property.create({
    data: {
      name: "Heights Fourplex",
      addressLine1: "908 E Hanna Ave",
      city: "Tampa",
      state: "FL",
      zip: "33604",
      type: "APARTMENT",
      ownerId: patel.id,
      managementFeeRate: 9,
      marketValue: 620000,
      mortgageBalance: 410000,
      notes: "Managed for Anil Patel at 9% of collections.",
      units: {
        create: [
          { label: "1", beds: 1, baths: 1, sqft: 620, marketRent: 1300, status: "OCCUPIED" },
          { label: "2", beds: 1, baths: 1, sqft: 620, marketRent: 1300, status: "OCCUPIED" },
          { label: "3", beds: 2, baths: 1, sqft: 850, marketRent: 1575, status: "VACANT" },
          { label: "4", beds: 2, baths: 1, sqft: 850, marketRent: 1575, status: "DOWN" },
        ],
      },
    },
    include: { units: { orderBy: { label: "asc" } } },
  });

  const leaseSpecs = [
    { unit: duplex.units[0], tenant: tenants[0], rent: 1650, deposit: 1650 },
    { unit: duplex.units[1], tenant: tenants[1], rent: 1600, deposit: 1600 },
    { unit: fourplex.units[0], tenant: tenants[2], rent: 1300, deposit: 1300 },
    { unit: fourplex.units[1], tenant: tenants[3], rent: 1275, deposit: 1275 },
  ];

  const leases = [];
  for (const spec of leaseSpecs) {
    leases.push(
      await prisma.lease.create({
        data: {
          unitId: spec.unit.id,
          tenantId: spec.tenant.id,
          startDate: inDays(-300),
          endDate: inDays(65),
          rentAmount: spec.rent,
          rentDueDay: 1,
          depositAmount: spec.deposit,
          depositHeld: spec.deposit,
          lateFeeAmount: 75,
          lateFeeAfterDay: 5,
          status: "ACTIVE",
          moveInDate: inDays(-300),
        },
      }),
    );
  }

  // Three months of rent charges. Everyone pays on time except Derrick Hall,
  // who is two months behind and has picked up a late fee.
  for (let offset = -2; offset <= 0; offset++) {
    const { key, first } = monthKey(offset);
    for (const lease of leases) {
      await prisma.charge.create({
        data: {
          leaseId: lease.id,
          type: "RENT",
          description: "Monthly rent",
          amount: lease.rentAmount,
          dueDate: first,
          period: key,
        },
      });

      const behind = lease.tenantId === tenants[3].id && offset >= -1;
      if (!behind) {
        const receivedAt = new Date(first);
        receivedAt.setDate(receivedAt.getDate() + 2);
        await prisma.payment.create({
          data: {
            leaseId: lease.id,
            amount: lease.rentAmount,
            receivedAt,
            method: "ACH",
            reference: `ACH-${key}`,
          },
        });
      }
    }
  }

  const lateLease = leases[3];
  const lastMonth = monthKey(-1);
  await prisma.charge.create({
    data: {
      leaseId: lateLease.id,
      type: "LATE_FEE",
      description: "Late fee",
      amount: 75,
      dueDate: inDays(-25),
      period: lastMonth.key,
    },
  });
  await prisma.lease.update({
    where: { id: lateLease.id },
    data: { status: "NOTICE", notes: "Two months behind. Pay-or-quit notice served." },
  });

  await prisma.workOrder.createMany({
    data: [
      {
        propertyId: fourplex.id,
        unitId: fourplex.units[3].id,
        vendorId: vendors[1].id,
        title: "AC compressor failed — unit 4 uninhabitable",
        description: "Compressor seized. Unit is down until replaced.",
        category: "HVAC",
        priority: "EMERGENCY",
        status: "ASSIGNED",
        reportedAt: inDays(-3),
        scheduledFor: inDays(1),
        estimatedCost: 4200,
      },
      {
        propertyId: duplex.id,
        unitId: duplex.units[0].id,
        vendorId: vendors[0].id,
        title: "Kitchen faucet dripping",
        category: "PLUMBING",
        priority: "NORMAL",
        status: "IN_PROGRESS",
        reportedAt: inDays(-9),
        estimatedCost: 180,
      },
      {
        propertyId: fourplex.id,
        unitId: fourplex.units[2].id,
        title: "Turn unit 3 for new tenant",
        description: "Paint, deep clean, replace blinds.",
        category: "TURNOVER",
        priority: "HIGH",
        status: "OPEN",
        reportedAt: inDays(-16),
        estimatedCost: 1400,
      },
      {
        propertyId: duplex.id,
        unitId: duplex.units[1].id,
        vendorId: vendors[0].id,
        title: "Water heater replacement",
        category: "PLUMBING",
        priority: "HIGH",
        status: "COMPLETED",
        reportedAt: inDays(-45),
        completedAt: inDays(-41),
        estimatedCost: 1100,
        actualCost: 1240,
      },
    ],
  });

  await prisma.expense.createMany({
    data: [
      {
        propertyId: duplex.id,
        vendorId: vendors[0].id,
        category: "REPAIRS",
        description: "Water heater replacement",
        amount: 1240,
        paidAt: inDays(-41),
      },
      {
        propertyId: duplex.id,
        category: "INSURANCE",
        description: "Quarterly property insurance",
        amount: 640,
        paidAt: inDays(-20),
      },
      {
        propertyId: fourplex.id,
        category: "UTILITIES",
        description: "Common area water & electric",
        amount: 385,
        paidAt: inDays(-12),
      },
      {
        propertyId: fourplex.id,
        vendorId: vendors[2].id,
        category: "TURNOVER",
        description: "Unit 3 deep clean",
        amount: 275,
        paidAt: inDays(-8),
      },
      {
        propertyId: fourplex.id,
        category: "TAXES",
        description: "Property tax installment",
        amount: 1820,
        paidAt: inDays(-15),
      },
    ],
  });

  console.log(
    "✅ Seeded properties, units, leases, ledger, maintenance, vendors, contacts, deals, activities, timeshares, points, reservations and fees.",
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
