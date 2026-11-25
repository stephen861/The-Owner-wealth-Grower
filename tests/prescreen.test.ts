import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePrescreen } from "../src/lib/leasing/prescreen";

const now = new Date("2026-11-25T12:00:00Z");
const racine = { name: "604 Racine Ave", bedrooms: [3], availableDate: new Date("2027-01-02") };
const full = { hasVoucher: true, voucherAgency: "CMHA", voucherBedrooms: 3, voucherExpires: new Date("2027-04-01"), householdSize: 4 };

test("asks for missing answers before any link", () => {
  const r = evaluatePrescreen({ hasVoucher: true }, racine, now);
  assert.equal(r.outcome, "ASK");
  assert.equal(r.missing.length, 4);
});
test("no voucher: link goes out once household size is known", () => {
  assert.equal(evaluatePrescreen({ hasVoucher: false }, racine, now).outcome, "ASK");
  const r = evaluatePrescreen({ hasVoucher: false, householdSize: 2 }, racine, now);
  assert.equal(r.outcome, "SEND_LINK");
  assert.match(r.summary, /no voucher/);
});
test("matching voucher sends the link", () => {
  const r = evaluatePrescreen(full, racine, now);
  assert.equal(r.outcome, "SEND_LINK");
  assert.deepEqual(r.flags, []);
});
test("voucher smaller than the home holds the link for Stephen", () => {
  const r = evaluatePrescreen({ ...full, voucherBedrooms: 2 }, racine, now);
  assert.equal(r.outcome, "HOLD");
  assert.match(r.summary, /HELD for Stephen: the voucher is for 2 bedrooms and 604 Racine Ave has 3/);
});
test("expired voucher, or one that runs out before move-in, is held", () => {
  assert.equal(evaluatePrescreen({ ...full, voucherExpires: new Date("2026-11-01") }, racine, now).outcome, "HOLD");
  assert.equal(evaluatePrescreen({ ...full, voucherExpires: new Date("2026-12-20") }, racine, now).outcome, "HOLD");
});
test("voucher expiring in under 30 days is flagged but still gets the link", () => {
  const home = { name: "8485 Rivertown Rd", bedrooms: [3], availableDate: null };
  const r = evaluatePrescreen({ ...full, voucherExpires: new Date("2026-12-10") }, home, now);
  assert.equal(r.outcome, "SEND_LINK");
  assert.match(r.summary, /Flag for Stephen: voucher expires in under 30 days/);
});
test("household size never holds the link", () => {
  assert.equal(evaluatePrescreen({ ...full, householdSize: 9 }, racine, now).outcome, "SEND_LINK");
});
