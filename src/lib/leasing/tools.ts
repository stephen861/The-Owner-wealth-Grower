// Tools the leasing agent can call. Every tool is scoped to ONE prospect —
// the agent cannot read or change any other person's record.
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { screenUnits } from "./eligibility";

export const PROSPECT_STATUSES = [
  "NEW",
  "PRESCREENED",
  "TOUR_SCHEDULED",
  "APPLYING",
  "WAITLIST",
  "LEASED",
  "NOT_ELIGIBLE",
  "CLOSED",
] as const;

export const leasingTools: Anthropic.Beta.BetaTool[] = [
  {
    name: "list_properties",
    description:
      "List FGW affordable-housing communities with program type, voucher acceptance, office hours, policies, application link, and count of available units by bedroom size. Call this before answering any question about properties, availability, policies or how to apply.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_units",
    description:
      "Search currently available or soon-available units. Returns unit number, bedrooms, rent, AMI set-aside %, accessibility, and available date. Never quote rent or availability without calling this.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "Limit to one property" },
        bedrooms: { type: "integer", description: "Exact bedroom count" },
        accessible_only: { type: "boolean", description: "Only ADA / mobility units" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "prescreen_eligibility",
    description:
      "Run the official income pre-screen against AMI limits and rent minimums. Use whenever the prospect has shared household size and gross annual income. Saves the answers to their record. Report results exactly as returned; this is a pre-screen, not an approval.",
    input_schema: {
      type: "object",
      properties: {
        household_size: { type: "integer", minimum: 1, maximum: 15 },
        annual_income: { type: "number", minimum: 0, description: "Gross yearly household income in USD" },
        has_voucher: { type: "boolean", description: "Has a Housing Choice Voucher / rental subsidy" },
        property_id: { type: "string" },
        bedrooms: { type: "integer" },
      },
      required: ["household_size", "annual_income", "has_voucher"],
      additionalProperties: false,
    },
  },
  {
    name: "update_prospect",
    description:
      "Save details the prospect shares (name, email, language, bedrooms wanted, move-in date, property of interest, notes) or move their pipeline status. Only save what they told you. Never record protected-class information (race, religion, national origin, disability details, familial status specifics, sex, etc.).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        preferred_language: { type: "string", description: "ISO code, e.g. en, es" },
        bedrooms_wanted: { type: "integer" },
        move_in_date: { type: "string", description: "YYYY-MM-DD" },
        property_id: { type: "string" },
        status: { type: "string", enum: [...PROSPECT_STATUSES] },
        notes: { type: "string", description: "Short leasing note to append" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "schedule_tour",
    description:
      "Book a tour. Confirm date, time and tour type with the prospect BEFORE calling. Times are local property time, ISO format YYYY-MM-DDTHH:MM. Tours run 9:00–17:30 Mon–Sat.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string" },
        datetime: { type: "string", description: "YYYY-MM-DDTHH:MM local time" },
        tour_type: { type: "string", enum: ["IN_PERSON", "VIRTUAL", "SELF_GUIDED"] },
      },
      required: ["property_id", "datetime", "tour_type"],
      additionalProperties: false,
    },
  },
  {
    name: "join_waitlist",
    description: "Add the prospect to a property's waitlist when no matching unit is available.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string" },
        bedrooms: { type: "integer" },
      },
      required: ["property_id"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to FGW staff. REQUIRED for: reasonable accommodation or modification requests, fair-housing or discrimination complaints, emergencies or maintenance from current residents, legal/eviction questions, an upset prospect, anything you cannot answer from tool data, or when the prospect asks for a person.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        urgency: { type: "string", enum: ["NORMAL", "URGENT"] },
      },
      required: ["reason", "urgency"],
      additionalProperties: false,
    },
  },
];

type Input = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const b = (v: unknown) => (typeof v === "boolean" ? v : undefined);

export async function runLeasingTool(prospectId: string, name: string, input: Input): Promise<string> {
  switch (name) {
    case "list_properties": {
      const props = await prisma.property.findMany({
        where: { active: true },
        include: { units: { where: { status: "AVAILABLE" } } },
        orderBy: { name: "asc" },
      });
      return JSON.stringify(
        props.map((p) => {
          const byBr: Record<string, number> = {};
          for (const u of p.units) byBr[`${u.bedrooms}BR`] = (byBr[`${u.bedrooms}BR`] ?? 0) + 1;
          return {
            property_id: p.id,
            name: p.name,
            address: [p.address, p.city, p.state].filter(Boolean).join(", "),
            program: p.program,
            accepts_vouchers: p.acceptsVouchers,
            office_phone: p.officePhone,
            office_hours: p.officeHours,
            amenities: p.amenities,
            policies: p.policies,
            application_url: p.applicationUrl,
            application_fee: p.applicationFee,
            available_units: byBr,
          };
        }),
      );
    }

    case "search_units": {
      const units = await prisma.unit.findMany({
        where: {
          status: "AVAILABLE",
          propertyId: s(input.property_id),
          bedrooms: n(input.bedrooms),
          accessible: b(input.accessible_only) ? true : undefined,
        },
        include: { property: true },
        orderBy: [{ rent: "asc" }],
        take: 15,
      });
      if (units.length === 0) return JSON.stringify({ units: [], note: "No matching units available. Offer the waitlist." });
      return JSON.stringify({
        units: units.map((u) => ({
          unit_id: u.id,
          property_id: u.propertyId,
          property: u.property.name,
          unit: u.unitNumber,
          bedrooms: u.bedrooms,
          bathrooms: u.bathrooms,
          sqft: u.sqft,
          rent: u.rent,
          ami_set_aside: u.amiPercent ? `${u.amiPercent}% AMI` : "market rate",
          accessible: u.accessible,
          available: u.availableDate ? u.availableDate.toISOString().slice(0, 10) : "now",
        })),
      });
    }

    case "prescreen_eligibility": {
      const householdSize = n(input.household_size);
      const annualIncome = n(input.annual_income);
      const hasVoucher = b(input.has_voucher) ?? false;
      if (!householdSize || annualIncome == null) return "Error: household_size and annual_income are required.";
      const propertyId = s(input.property_id);
      const props = await prisma.property.findMany({
        where: { active: true, id: propertyId },
        include: {
          incomeLimits: true,
          units: { where: { status: "AVAILABLE", bedrooms: n(input.bedrooms) } },
        },
      });
      const results = props.map((p) => {
        const screened = screenUnits({
          units: p.units,
          limits: p.incomeLimits,
          householdSize,
          annualIncome,
          hasVoucher,
          minIncomeMultiple: p.minIncomeMultiple,
        });
        return {
          property_id: p.id,
          property: p.name,
          eligible_units: screened.filter((x) => x.eligible).map((x) => ({ unit: x.unitNumber, bedrooms: x.bedrooms, rent: x.rent, ami: x.amiPercent })),
          not_eligible: screened.filter((x) => !x.eligible).map((x) => ({ unit: x.unitNumber, why: x.reasons })),
        };
      });
      const anyEligible = results.some((r) => r.eligible_units.length > 0);
      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          householdSize,
          annualIncome,
          hasVoucher,
          status: anyEligible ? "PRESCREENED" : undefined,
        },
      });
      return JSON.stringify({
        disclaimer: "Pre-screen only. Final eligibility is determined after a complete application and income verification.",
        any_eligible: anyEligible,
        results,
      });
    }

    case "update_prospect": {
      const status = s(input.status);
      const moveIn = s(input.move_in_date);
      const note = s(input.notes);
      const current = await prisma.prospect.findUnique({ where: { id: prospectId } });
      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          name: s(input.name),
          email: s(input.email),
          preferredLanguage: s(input.preferred_language),
          bedroomsWanted: n(input.bedrooms_wanted),
          moveInDate: moveIn && !Number.isNaN(Date.parse(moveIn)) ? new Date(moveIn) : undefined,
          propertyId: s(input.property_id),
          status: status && (PROSPECT_STATUSES as readonly string[]).includes(status) ? status : undefined,
          notes: note ? [current?.notes, `• ${note}`].filter(Boolean).join("\n") : undefined,
        },
      });
      return "Saved.";
    }

    case "schedule_tour": {
      const propertyId = s(input.property_id);
      const when = s(input.datetime);
      if (!propertyId || !when) return "Error: property_id and datetime required.";
      const at = new Date(when);
      if (Number.isNaN(at.getTime())) return "Error: invalid datetime. Use YYYY-MM-DDTHH:MM.";
      if (at.getTime() < Date.now() + 60 * 60 * 1000) return "Error: tours must be booked at least 1 hour ahead.";
      const mins = at.getHours() * 60 + at.getMinutes();
      if (at.getDay() === 0 || mins < 9 * 60 || mins > 17 * 60 + 30)
        return "Error: outside tour hours (Mon–Sat 9:00–17:30). Offer another time.";
      const prop = await prisma.property.findUnique({ where: { id: propertyId } });
      if (!prop) return "Error: unknown property_id.";
      const clash = await prisma.tour.findFirst({
        where: {
          propertyId,
          status: "SCHEDULED",
          scheduledAt: { gte: new Date(at.getTime() - 29 * 60000), lte: new Date(at.getTime() + 29 * 60000) },
        },
      });
      if (clash) return "Error: that slot is taken. Offer a time at least 30 minutes earlier or later.";
      const tour = await prisma.tour.create({
        data: { prospectId, propertyId, scheduledAt: at, type: s(input.tour_type) ?? "IN_PERSON" },
      });
      await prisma.prospect.update({ where: { id: prospectId }, data: { status: "TOUR_SCHEDULED", propertyId } });
      return JSON.stringify({ booked: true, tour_id: tour.id, property: prop.name, address: prop.address, when: at.toString() });
    }

    case "join_waitlist": {
      const propertyId = s(input.property_id);
      if (!propertyId) return "Error: property_id required.";
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { status: "WAITLIST", propertyId, bedroomsWanted: n(input.bedrooms) },
      });
      return "Added to waitlist. Staff will contact them when a matching unit opens.";
    }

    case "escalate_to_human": {
      const reason = s(input.reason) ?? "Agent requested handoff";
      const urgent = s(input.urgency) === "URGENT";
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { needsHuman: true, escalationReason: `${urgent ? "[URGENT] " : ""}${reason}` },
      });
      return `Escalated. Tell the prospect a team member will follow up${urgent ? " as soon as possible" : " during office hours"}, and they can call ${process.env.FGW_OFFICE_PHONE || "the leasing office"}.`;
    }

    default:
      return `Error: unknown tool ${name}`;
  }
}
