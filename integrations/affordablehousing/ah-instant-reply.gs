/**
 * FGW: instant reply to AffordableHousing.com leads.
 *
 * Runs inside the fgwleasing@gmail.com Google account (Apps Script), every minute.
 *  - "New Renter Lead for ..." emails carry the prospect's relay email and phone.
 *    For homes in HOMES below, the prospect gets an email right away naming the
 *    home, offering two tour times and asking them to text 614-820-5332.
 *    Once they text, the leasing agent takes over (inbound first, so it's
 *    covered by the texting registration). We never text them first.
 *  - "New Prospect Message Alert for ..." emails have no email or phone, and
 *    replying to them goes nowhere (donotreply). Those are only logged, flagged
 *    "reply in AffordableHousing".
 *  - Every lead is logged to the tracker sheet. Credit and income details in the
 *    lead email are NOT copied anywhere (no-screening rule).
 *  - Only leads that arrive after setup() runs are touched. No backlog.
 *
 * Setup (owner, signed in as fgwleasing@gmail.com):
 *  1. script.google.com > New project > paste this file.
 *  2. SHEET_ID is already filled in (FGW Leasing Tracker – Showings & Prospects).
 *  3. Run setup() once and approve Google's permission screen.
 *  3b. Texting agent leads (optional, same script): run setupAgentWebhook() once,
 *     then Deploy > New deployment > Web app, execute as Me, access Anyone.
 *     Copy the web app URL and the token from the run log into Render as
 *     TRACKER_WEBHOOK_URL and TRACKER_WEBHOOK_TOKEN. The agent then keeps one
 *     row per texting prospect up to date in the "Texting agent leads" tab.
 *  4. SEND_ENABLED stays false until the email wording is approved: until then
 *     leads are logged with "would send" and nothing goes out.
 */

const CONFIG = {
  SEND_ENABLED: false,               // flip to true only after wording approval
  // FGW Leasing Tracker – Showings & Prospects (shared with fgwleasing@gmail.com as editor)
  SHEET_ID: '1J8W_6FujBVdNoKEbYYKASKHKWqH80zDGrcgrj9uJsY4',
  SHEET_TAB: 'AffordableHousing leads',
  AGENT_TAB: 'Texting agent leads',  // one row per prospect, updated in place
  AGENT_NUMBER: '614-820-5332',
  FROM_NAME: 'FGW Property Management',
  TIMEZONE: 'America/New_York',
  DONE_LABEL: 'AH-processed',
  // Only these homes get an automatic reply. Keys must match the address in the
  // lead email ("... is interested in 48 S Richardson Ave, Valleyview.").
  // 1188 Sidney must never be added.
  HOMES: {
    '48 S Richardson Ave': '2 bedrooms, 1 bath, $1,400 a month, available now',
  },
};

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('START_MS')) props.setProperty('START_MS', String(Date.now()));
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkLeads').timeBased().everyMinutes(1).create();
  getLabel_();
  getSheet_();
}

function checkLeads() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const start = Number(PropertiesService.getScriptProperties().getProperty('START_MS') || Date.now());
    const label = getLabel_();
    const threads = GmailApp.search(
      'from:donotreply@affordablehousing.com newer_than:2d -label:' + CONFIG.DONE_LABEL +
      ' (subject:"New Renter Lead" OR subject:"New Prospect Message Alert")');
    threads.forEach(thread => {
      thread.getMessages().forEach(msg => {
        if (msg.getDate().getTime() < start) return;
        const subject = msg.getSubject();
        if (subject.indexOf('New Renter Lead') === 0) handleRenterLead_(msg);
        else if (subject.indexOf('New Prospect Message Alert') === 0) handleMessageAlert_(msg);
      });
      thread.addLabel(label);
    });
  } finally {
    lock.releaseLock();
  }
}

function handleRenterLead_(msg) {
  const body = msg.getPlainBody();
  const name = match_(body, /Name:\s*(.+?)\s+Email:/);
  const email = match_(body, /Email:\s*(\S+@\S+?)\s+Phone:/);
  const phone = match_(body, /Phone:\s*([\d\-\(\)\s\.+]{7,})\s+Message:/);
  const message = match_(body, /Message:\s*([\s\S]*?)\s*(?:Applicant details|\|)/);
  const home = match_(body, /is interested in\s+(.+?),\s*[^,]+\.\s*/);
  const facts = CONFIG.HOMES[home];

  let action;
  if (!facts) action = 'Not auto-replied: home not on the reply list';
  else if (!email) action = 'Not auto-replied: no email in lead';
  else {
    const reply = buildReply_(name, home, facts, message);
    if (CONFIG.SEND_ENABLED) {
      GmailApp.sendEmail(email, reply.subject, reply.body, { name: CONFIG.FROM_NAME });
      action = 'Auto-reply sent';
    } else {
      action = 'Would send (sending off)';
    }
  }
  log_([msg.getDate(), 'Renter Lead', home, name, phone, email, message, action]);
}

function handleMessageAlert_(msg) {
  const body = msg.getPlainBody();
  const name = match_(body, /From:\s*(.+?)\s*\|/);
  const home = match_(body, /Property of Interest:\s*(.+?)\s*\|/);
  const message = match_(body, /Property of Interest:[^|]*\|\s*\n?\|\s*(.+?)\s*\|/);
  log_([msg.getDate(), 'Message Alert', home, name, '', '', message,
        'Reply in AffordableHousing (no email or phone given)']);
}

function buildReply_(name, home, facts, message) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const slots = nextTourSlots_();
  const asked = message ? '\n\nWe got your message and can answer your questions by text too.' : '';
  return {
    subject: 'Touring ' + home,
    body:
      'Hi ' + first + ',\n\n' +
      'Thanks for your interest in ' + home + '. It\'s ' + facts + '.\n\n' +
      'I can show it ' + slots + '. Text ' + CONFIG.AGENT_NUMBER +
      ' with the time that works for you, or suggest another time, and we\'ll get you on the schedule.' +
      asked + '\n\n' +
      CONFIG.FROM_NAME + '\n' + CONFIG.AGENT_NUMBER + '\n',
  };
}

// Tour hours match the agent: Mon-Sat 9:00-17:30. Offer the next tour day that
// is at least 18 hours away, at 11:00 AM and 4:00 PM. George still confirms.
function nextTourSlots_() {
  const d = new Date(Date.now() + 18 * 3600 * 1000);
  for (let i = 0; i < 7; i++) {
    const dow = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'u')); // 1=Mon..7=Sun
    if (dow !== 7) break;
    d.setTime(d.getTime() + 24 * 3600 * 1000);
  }
  const day = Utilities.formatDate(d, CONFIG.TIMEZONE, 'EEEE, MMM d');
  return day + ' at 11:00 AM or 4:00 PM';
}

function log_(row) {
  const sheet = getSheet_();
  if (sheet) sheet.appendRow(row);
}

function getSheet_() {
  if (!CONFIG.SHEET_ID) return null;
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sh = ss.getSheetByName(CONFIG.SHEET_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_TAB);
    sh.appendRow(['Received', 'Type', 'Home', 'Name', 'Phone', 'Email (AH relay)', 'Message', 'Action']);
  }
  return sh;
}

function getLabel_() {
  return GmailApp.getUserLabelByName(CONFIG.DONE_LABEL) || GmailApp.createLabel(CONFIG.DONE_LABEL);
}

function match_(text, re) {
  const m = text.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

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
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  const token = PropertiesService.getScriptProperties().getProperty('AGENT_TOKEN');
  if (!token || data.token !== token) return json_({ ok: false, error: 'unauthorized' });
  if (data.kind !== 'agent_lead' || !data.lead || !data.lead.id) return json_({ ok: false, error: 'bad payload' });

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
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function getAgentSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sh = ss.getSheetByName(CONFIG.AGENT_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.AGENT_TAB);
    sh.appendRow(AGENT_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
