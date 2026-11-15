// Load (or reload) the synthetic Command Center demo dataset.
// Touches only Demo* tables. Run with: npm run demo:seed
import { prisma } from "../src/lib/prisma";
import { demoDataCounts, resetDemoData } from "../src/lib/command-center/seed";
import { AUDITED_SOURCE_COUNTS, DEMO_DATASET_NAME } from "../src/lib/command-center/demo-data";

async function main() {
  await resetDemoData();
  const counts = await demoDataCounts();

  console.log(`\n✅ Loaded ${DEMO_DATASET_NAME}\n`);
  console.log("Demo table row counts:");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(16)} ${count}`);
  }
  console.log("\nMirrored audited source counts (shape only, no rows copied):");
  for (const [table, count] of Object.entries(AUDITED_SOURCE_COUNTS)) {
    console.log(`  ${table.padEnd(22)} ${count}`);
  }
  console.log("\nAll values are synthetic. No live base was read or written.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
