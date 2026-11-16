// Import real listing data from CSV.
//   npm run leasing:import -- <folder>            (dry run: validates, writes nothing)
//   npm run leasing:import -- <folder> --apply    (writes to the database)
// Folder holds properties.csv, units.csv, income_limits.csv (see docs/leasing/templates).
// Upserts by property name and (property, unit number); safe to re-run.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "./csv";
import { isValidTimeZone } from "../src/lib/leasing/time";

const prisma = new PrismaClient();
const PROGRAMS = ["LIHTC", "SECTION_8", "PBV", "HOME", "MIXED", "MARKET"];
const UNIT_STATUSES = ["AVAILABLE", "ON_HOLD", "LEASED", "DOWN"];

const errors: string[] = [];
const err = (file: string, line: number, msg: string) => errors.push(`${file} row ${line}: ${msg}`);
const yes = (v: string) => /^(y|yes|true|1)$/i.test(v);
const money = (v: string) => (v === "" ? null : Number(v.replace(/[$,\s]/g, "")));

function read(dir: string, name: string, required: boolean) {
  const f = path.join(dir, name);
  if (!fs.existsSync(f)) {
    if (required) errors.push(`${name}: file missing`);
    return [];
  }
  return parseCsv(fs.readFileSync(f, "utf8"));
}

async function main() {
  const [dir, flag] = process.argv.slice(2);
  if (!dir) throw new Error("Usage: npm run leasing:import -- <folder> [--apply]");
  const apply = flag === "--apply";

  const props = read(dir, "properties.csv", true);
  const units = read(dir, "units.csv", true);
  const limits = read(dir, "income_limits.csv", false); // optional: only needed for income-restricted (AMI) units

  const propNames = new Set<string>();
  props.forEach((r, i) => {
    const line = i + 2;
    if (!r.name) err("properties.csv", line, "name is required");
    if (propNames.has(r.name)) err("properties.csv", line, `duplicate property "${r.name}"`);
    propNames.add(r.name);
    if (r.timezone && !isValidTimeZone(r.timezone)) err("properties.csv", line, `invalid timezone "${r.timezone}"`);
    if (r.program && !PROGRAMS.includes(r.program.toUpperCase())) err("properties.csv", line, `program must be one of ${PROGRAMS.join(", ")}`);
    if (r.application_url && !/^https:\/\//.test(r.application_url)) err("properties.csv", line, "application_url must start with https://");
  });
  const known = async (name: string) => propNames.has(name) || Boolean(await prisma.property.findFirst({ where: { name } }));

  for (const [i, r] of units.entries()) {
    const line = i + 2;
    if (!(await known(r.property_name))) err("units.csv", line, `unknown property "${r.property_name}"`);
    if (!r.unit_number) err("units.csv", line, "unit_number is required");
    if (!/^\d+$/.test(r.bedrooms)) err("units.csv", line, "bedrooms must be a whole number");
    const rent = money(r.rent);
    if (rent == null || !Number.isFinite(rent) || rent <= 0) err("units.csv", line, "rent must be a positive number");
    if (r.ami_percent && !/^\d+$/.test(r.ami_percent)) err("units.csv", line, "ami_percent must be a number (0 = market rate)");
    if (r.status && !UNIT_STATUSES.includes(r.status.toUpperCase())) err("units.csv", line, `status must be one of ${UNIT_STATUSES.join(", ")}`);
    if (r.available_date && Number.isNaN(Date.parse(r.available_date))) err("units.csv", line, "available_date must be YYYY-MM-DD");
    if (r.tour_video_url && !/^https:\/\//.test(r.tour_video_url)) err("units.csv", line, "tour_video_url must start with https://");
  }
  for (const [i, r] of limits.entries()) {
    const line = i + 2;
    if (!(await known(r.property_name))) err("income_limits.csv", line, `unknown property "${r.property_name}"`);
    if (!/^\d+$/.test(r.ami_percent)) err("income_limits.csv", line, "ami_percent must be a number");
    const vals = [1, 2, 3, 4, 5, 6, 7, 8].map((h) => money(r[`hh${h}`] ?? ""));
    if (vals.some((v) => v == null || !Number.isFinite(v) || v <= 0)) err("income_limits.csv", line, "hh1–hh8 must all be positive numbers");
    if (vals.every((v) => v != null) && vals.some((v, k) => k > 0 && v! < vals[k - 1]!)) err("income_limits.csv", line, "limits should increase with household size — check column order");
  }
  // Every restricted AMI level used by a unit needs a limits row.
  for (const u of units) {
    const ami = Number(u.ami_percent || 60);
    if (ami > 0 && !limits.some((l) => l.property_name === u.property_name && Number(l.ami_percent) === ami))
      errors.push(`units.csv: ${u.property_name} unit ${u.unit_number} is ${ami}% AMI but income_limits.csv has no ${ami}% row for that property`);
  }

  console.log(`Read ${props.length} properties, ${units.length} units, ${limits.length} income-limit rows.`);
  if (errors.length) {
    console.error(`\n❌ ${errors.length} problem(s) — nothing imported:\n  ` + [...new Set(errors)].join("\n  "));
    process.exit(1);
  }
  if (!apply) {
    console.log("\n✅ Validation passed. Dry run — nothing written. Re-run with --apply to import.");
    return;
  }

  const ids = new Map<string, string>();
  for (const r of props) {
    const data = {
      address: r.address || null,
      city: r.city || null,
      state: r.state || null,
      timezone: r.timezone || "America/New_York",
      program: (r.program || "LIHTC").toUpperCase(),
      acceptsVouchers: r.accepts_vouchers ? yes(r.accepts_vouchers) : true,
      officePhone: r.office_phone || null,
      officeHours: r.office_hours || null,
      applicationUrl: r.application_url || null,
      applicationFee: money(r.application_fee ?? ""),
      minIncomeMultiple: money(r.min_income_multiple ?? "") ?? 2,
      amenities: r.amenities || null,
      policies: r.policies || null,
    };
    const existing = await prisma.property.findFirst({ where: { name: r.name } });
    const p = existing
      ? await prisma.property.update({ where: { id: existing.id }, data })
      : await prisma.property.create({ data: { name: r.name, ...data } });
    ids.set(r.name, p.id);
  }
  const idFor = async (name: string) => ids.get(name) ?? (await prisma.property.findFirstOrThrow({ where: { name } })).id;

  for (const r of units) {
    const propertyId = await idFor(r.property_name);
    const data = {
      bedrooms: Number(r.bedrooms),
      bathrooms: money(r.bathrooms ?? "") ?? 1,
      sqft: money(r.sqft ?? ""),
      rent: money(r.rent)!,
      amiPercent: r.ami_percent === "" ? 60 : Number(r.ami_percent),
      accessible: yes(r.accessible ?? ""),
      status: (r.status || "AVAILABLE").toUpperCase(),
      availableDate: r.available_date ? new Date(r.available_date) : null,
      tourVideoUrl: r.tour_video_url || null,
    };
    await prisma.unit.upsert({
      where: { propertyId_unitNumber: { propertyId, unitNumber: r.unit_number } },
      update: data,
      create: { propertyId, unitNumber: r.unit_number, ...data },
    });
  }
  for (const r of limits) {
    const propertyId = await idFor(r.property_name);
    const amiPercent = Number(r.ami_percent);
    const year = r.year ? Number(r.year) : null;
    for (let h = 1; h <= 8; h++) {
      const maxIncome = money(r[`hh${h}`])!;
      await prisma.incomeLimit.upsert({
        where: { propertyId_amiPercent_householdSize: { propertyId, amiPercent, householdSize: h } },
        update: { maxIncome, year },
        create: { propertyId, amiPercent, householdSize: h, maxIncome, year },
      });
    }
  }
  console.log("\n✅ Imported. Run `npm run leasing:check` next.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
