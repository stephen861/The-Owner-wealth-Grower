/**
 * FGW: texting agent leads -> FGW Leasing Tracker, "Texting agent leads" tab.
 * Standalone add-on: paste into the existing Apps Script project in
 * fgwleasing@gmail.com (or its own project). Needs no Gmail access.
 *  1. Paste this file in as a new script file.
 *  2. Run setupAgentWebhook() once; the run log shows the token.
 *  3. Deploy > New deployment > Web app, execute as Me, access Anyone. Copy the URL.
 *  4. On Render (fgw-leasing): TRACKER_WEBHOOK_URL = that URL,
 *     TRACKER_WEBHOOK_TOKEN = the token from step 2.
 * The agent then keeps one row per texting prospect up to date.
 * If the project already has a doPost(), merge this one into it.
 */
const AGENT_SHEET_ID = '1J8W_6FujBVdNoKEbYYKASKHKWqH80zDGrcgrj9uJsY4'; // FGW Leasing Tracker – Showings & Prospects
const AGENT_TAB_NAME = 'Texting agent leads';

// ---- Texting agent leads (posted by the leasing agent on Render) ----------

const AGENT_HEADERS = ['Lead ID', 'First contact', 'Last activity', 'Source', 'Name', 'Phone', 'Email',
  'Home', 'Bedrooms', 'Move-in', 'Status', 'Tour', 'Tour status', 'Needs staff', 'Why',
  'Last message from prospect', 'Last agent reply', 'Texts opted out'];

/** Run once: makes the shared token the agent must send. Copy it from the log into Render. */
function setupAgentWebhook() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('AGENT_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('AGENT_TOKEN', token);
  }
  getAgentSheet_();
  Logger.log('TRACKER_WEBHOOK_TOKEN for Render: ' + token);
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return agentJson_({ ok: false, error: 'bad json' }); }
  const token = PropertiesService.getScriptProperties().getProperty('AGENT_TOKEN');
  if (!token || data.token !== token) return agentJson_({ ok: false, error: 'unauthorized' });
  if (data.kind !== 'agent_lead' || !data.lead || !data.lead.id) return agentJson_({ ok: false, error: 'bad payload' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getAgentSheet_();
    const l = data.lead;
    const row = [l.id, l.firstContact, l.lastActivity, l.source, l.name, l.phone, l.email, l.home,
      l.bedrooms, l.moveIn, l.status, l.tour, l.tourStatus, l.needsStaff ? 'Yes' : '', l.why,
      l.lastIn, l.lastOut, l.optedOut ? 'Yes' : ''].map(v => (v === null || v === undefined) ? '' : String(v));
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
    const i = ids.indexOf(String(l.id));
    if (i >= 0) sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return agentJson_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function getAgentSheet_() {
  const ss = SpreadsheetApp.openById(AGENT_SHEET_ID);
  let sh = ss.getSheetByName(AGENT_TAB_NAME);
  if (!sh) {
    sh = ss.insertSheet(AGENT_TAB_NAME);
    sh.appendRow(AGENT_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function agentJson_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
