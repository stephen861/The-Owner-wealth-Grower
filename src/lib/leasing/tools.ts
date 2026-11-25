// Tools the leasing agent can call. Every tool is scoped to ONE prospect —
// the agent cannot read or change any other person's record.
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { AGENT_STATUSES, missingIntakeItems, staffReviewNote } from "./intake";
import { formatInZone, parseWallTime, zonedToUtc } from "./time";
import { newTourCode, notifyTourRequested, tourBookingMode } from "./tours";
import { evaluatePrescreen } from "./prescreen";

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
      "Search currently available or soon-available units. Returns unit number, bedrooms, rent, AMI set-aside %, accessibility, available date, and video_tour_url when a 3D/video walkthrough exists (null when none). Never quote rent or availability without calling this.",
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
    name: "record_household_info",
    description:
      "Save the household details the prospect shares for the FGW team to review: household size, gross income, voucher, bedrooms wanted. This does NOT decide eligibility and returns no verdict. The team (not you) reviews every household. Returns the items still missing so you can ask for them.",
    input_schema: {
      type: "object",
      properties: {
        household_size: { type: "integer", minimum: 1, maximum: 20 },
        annual_income: { type: "number", minimum: 0, description: "Gross yearly household income in USD (multiply monthly by 12)" },
        has_voucher: { type: "boolean", description: "Has a Housing Choice Voucher / rental subsidy" },
        bedrooms: { type: "integer" },
      },
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
        status: { type: "string", enum: [...AGENT_STATUSES] },
        notes: { type: "string", description: "Short leasing note to append" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "request_tour",
    description:
      "Record a TOUR REQUEST. The FGW team (George) confirms every showing; you never book or confirm one. Agree a date, time and tour type with the prospect BEFORE calling. Give the time in the PROPERTY's local time as YYYY-MM-DDTHH:MM. Requests can be for 9:00–17:30 Mon–Sat, property local time.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string" },
        datetime: { type: "string", description: "YYYY-MM-DDTHH:MM local time" },
        tour_type: { type: "string", enum: ["IN_PERSON"], description: "Only in-person tours are offered for now." },
      },
      required: ["property_id", "datetime", "tour_type"],
      additionalProperties: false,
    },
  },
  {
    name: "record_voucher_prescreen",
    description:
      "REQUIRED before you send the application link. Save the pre-screen answers for the home the prospect wants: whether they will use a housing voucher, and if so the agency, the voucher's bedroom size and its expiration date, plus how many people will live in the home. Call it again as answers come in. Follow the returned instruction exactly: send the application link only when it says send_link.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string" },
        has_voucher: { type: "boolean", description: "true if they will pay with a housing voucher (Section 8 / HCV), false if paying without one" },
        voucher_agency: { type: "string", description: "Agency that issued the voucher, e.g. CMHA" },
        voucher_bedrooms: { type: "integer", description: "Bedroom size printed on the voucher" },
        voucher_expiration: { type: "string", description: "Voucher expiration date, YYYY-MM-DD" },
        household_size: { type: "integer", description: "People who will live in the home" },
      },
      required: ["property_id"],
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
            timezone: p.timezone,
            local_time_now: new Date().toLocaleString("en-US", { timeZone: p.timezone, dateStyle: "full", timeStyle: "short" }),
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
          rent: u.rent > 0 ? u.rent : null,
          ...(u.rent > 0 ? {} : { rent_note: "Rent and deposit are not set yet. Say the FGW team will confirm the price; never guess it." }),
          ami_set_aside: u.amiPercent ? `${u.amiPercent}% AMI` : "market rate",
          accessible: u.accessible,
          available: u.availableDate ? u.availableDate.toISOString().slice(0, 10) : "now",
          video_tour_url: u.tourVideoUrl ?? null,
        })),
      });
    }

    case "record_household_info": {
      const updated = await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          householdSize: n(input.household_size),
          annualIncome: n(input.annual_income),
          hasVoucher: b(input.has_voucher),
          bedroomsWanted: n(input.bedrooms),
        },
      });
      const missing = missingIntakeItems(updated);
      const flag = ["NEW", "PRESCREENED"].includes(updated.status);
      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          status: updated.status === "NEW" ? "PRESCREENED" : undefined, // PRESCREENED = "info collected", not a decision
          // Put the household in the staff review queue; the AI keeps chatting.
          needsHuman: flag ? true : undefined,
          escalationReason: flag && !updated.needsHuman ? staffReviewNote(updated) : undefined,
        },
      });
      return JSON.stringify({
        saved: true,
        still_missing: missing,
        instruction:
          "Do NOT tell the prospect whether they qualify, are eligible, are over or under any limit, or fit a unit size. Thank them, say the FGW team reviews every household and will follow up, ask for anything still missing, and run the voucher pre-screen (record_voucher_prescreen) before sending the application link. Tours come after the FGW team approves the application.",
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
          status: status && (AGENT_STATUSES as readonly string[]).includes(status) ? status : undefined,
          notes: note ? [current?.notes, `• ${note}`].filter(Boolean).join("\n") : undefined,
        },
      });
      return "Saved.";
    }

    case "request_tour": {
      const propertyId = s(input.property_id);
      const when = s(input.datetime);
      if (!propertyId || !when) return "Error: property_id and datetime required.";
      const prop = await prisma.property.findUnique({ where: { id: propertyId } });
      if (!prop) return "Error: unknown property_id.";
      const wall = parseWallTime(when);
      if (!wall) return "Error: invalid datetime. Use YYYY-MM-DDTHH:MM in the property's local time.";
      const mins = wall.hour * 60 + wall.minute;
      if (wall.weekday === 0 || mins < 9 * 60 || mins > 17 * 60 + 30)
        return "Error: outside tour hours (Mon–Sat 9:00–17:30 property local time). Offer another time.";
      const at = zonedToUtc(wall, prop.timezone);
      if (at.getTime() < Date.now() + 60 * 60 * 1000) return "Error: tour requests must be at least 1 hour ahead.";
      const clash = await prisma.tour.findFirst({
        where: {
          propertyId,
          status: { in: ["REQUESTED", "SCHEDULED"] },
          scheduledAt: { gte: new Date(at.getTime() - 29 * 60000), lte: new Date(at.getTime() + 29 * 60000) },
        },
      });
      if (clash) return "Error: that slot is taken. Offer a time at least 30 minutes earlier or later.";
      const auto = tourBookingMode() === "auto";
      const tour = await prisma.tour.create({
        data: {
          prospectId,
          propertyId,
          scheduledAt: at,
          type: "IN_PERSON",
          status: auto ? "SCHEDULED" : "REQUESTED",
          confirmedAt: auto ? new Date() : null,
          code: await newTourCode(),
        },
      });
      await notifyTourRequested(tour.id);
      const whenLocal = formatInZone(at, prop.timezone);
      // Status value stays TOUR_SCHEDULED for compatibility; staff screens label it "Tour requested".
      const current = await prisma.prospect.findUnique({ where: { id: prospectId } });
      const ask = `Tour request: ${whenLocal} at ${prop.name}. Confirm with the prospect.`;
      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          status: "TOUR_SCHEDULED",
          propertyId,
          // Auto-booked tours need no one to confirm them.
          needsHuman: auto ? undefined : true,
          escalationReason: auto ? undefined : current?.escalationReason ? `${current.escalationReason} | ${ask}` : ask,
        },
      });
      if (auto)
        return JSON.stringify({
          requested: true,
          confirmed: true,
          tour_id: tour.id,
          property: prop.name,
          when: whenLocal,
          instruction:
            "This tour IS confirmed. Tell the prospect it is booked for this time at the street address, that a member of the FGW team will meet them there, and that they'll get a reminder that morning. Never share a lockbox or entry code.",
        });
      return JSON.stringify({
        requested: true,
        confirmed: false,
        tour_id: tour.id,
        property: prop.name,
        when: whenLocal,
        instruction:
          "Tell the prospect their tour REQUEST for this time is in, and that someone from the FGW team will text to confirm it. Never say the tour is booked, scheduled or confirmed, and never share an address detail, lockbox or entry code beyond the street address.",
      });
    }

    case "record_voucher_prescreen": {
      const propertyId = s(input.property_id);
      if (!propertyId) return "Error: property_id required.";
      const prop = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { units: { where: { status: "AVAILABLE" }, select: { bedrooms: true, availableDate: true } } },
      });
      if (!prop) return "Error: unknown property_id.";
      if (!prop.units.length) return "Error: this home has no available units. Tell them it has been rented and offer the open homes nearby.";
      const exp = s(input.voucher_expiration);
      const expDate = exp && !Number.isNaN(Date.parse(exp)) ? new Date(exp) : undefined;
      const hv = b(input.has_voucher);
      const before = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
      const merged = {
        hasVoucher: hv ?? before.hasVoucher,
        voucherAgency: s(input.voucher_agency) ?? before.voucherAgency,
        voucherBedrooms: n(input.voucher_bedrooms) ?? before.voucherBedrooms,
        voucherExpires: expDate ?? before.voucherExpires,
        householdSize: n(input.household_size) ?? before.householdSize,
      };
      const dates = prop.units.map((u) => u.availableDate).filter((d): d is Date => Boolean(d));
      const res = evaluatePrescreen(merged, {
        name: prop.name,
        bedrooms: prop.units.map((u) => u.bedrooms),
        availableDate: dates.length === prop.units.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
      });
      const forStephen = res.outcome === "HOLD" || res.flags.length > 0;
      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          ...merged,
          propertyId,
          prescreen: res.summary,
          status: res.outcome === "SEND_LINK" ? "APPLYING" : before.status === "NEW" ? "PRESCREENED" : undefined,
          needsHuman: forStephen ? true : undefined,
          escalationReason: forStephen ? `For Stephen: ${res.summary}` : undefined,
        },
      });
      if (res.outcome === "ASK")
        return JSON.stringify({
          instruction: "ask_for_missing",
          still_missing: res.missing,
          note: "Do not send the application link yet. Ask for the missing items, one or two at a time, then call this tool again.",
        });
      if (res.outcome === "HOLD")
        return JSON.stringify({
          instruction: "hold_link",
          reasons: res.holdReasons,
          note: "Do NOT send the application link. Kindly tell them, in plain words, what doesn't line up yet (the reasons above), that they should not pay any application fee yet, and that Stephen with FGW will review it and follow up. Never say they are denied, rejected or don't qualify. You may offer other open homes whose bedroom count matches their voucher.",
        });
      return JSON.stringify({
        instruction: "send_link",
        application_url: prop.applicationUrl,
        application_fee: prop.applicationFee,
        note: "Send the application link now with the fee ($30 per adult; every adult who will live there applies). Say showings are set up after the application is submitted and approved.",
      });
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
