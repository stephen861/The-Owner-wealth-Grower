// Identifies the seeded demo records so they can be found and removed before go-live.
export const DEMO_PROPERTIES = ["FGW Oak Terrace Apartments", "FGW Maple Commons Senior & Family"];
export const DEMO_PROSPECT_WHERE = {
  OR: [{ phone: "+15555550123" }, { webSessionId: "demo-session-0000000001" }],
};
