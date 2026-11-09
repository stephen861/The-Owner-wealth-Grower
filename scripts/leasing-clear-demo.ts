// Remove the seeded demo properties, units, limits and demo conversations.
//   npm run leasing:clear-demo            (shows what would be removed)
//   npm run leasing:clear-demo -- --apply
import { PrismaClient } from "@prisma/client";

import { DEMO_PROPERTIES, DEMO_PROSPECT_WHERE } from "./demo-data";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const props = await prisma.property.findMany({ where: { name: { in: DEMO_PROPERTIES } }, include: { _count: { select: { units: true } } } });
  const prospects = await prisma.prospect.count({ where: DEMO_PROSPECT_WHERE });
  console.log(`Demo data found: ${props.length} properties (${props.reduce((s, p) => s + p._count.units, 0)} units), ${prospects} demo prospects.`);
  if (!apply) return console.log("Dry run — re-run with --apply to delete.");
  await prisma.prospect.deleteMany({ where: DEMO_PROSPECT_WHERE });
  await prisma.property.deleteMany({ where: { name: { in: DEMO_PROPERTIES } } }); // cascades units, limits, tours
  console.log("✅ Demo data removed.");
}

main().finally(() => prisma.$disconnect());
