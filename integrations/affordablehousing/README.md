# AffordableHousing.com leads: instant reply + texting registration

## 1. Instant email reply (ah-instant-reply.gs)

Why email, not text: the verified texting campaign (Low Volume Mixed) only
covers people who said yes on a call to 614-820-5332 or used the FGW opt-in
form. A first text to a listing-site lead isn't covered. A prospect who texts
us first is fine, so the email asks them to text.

What the lead emails give us (checked Nov 16 on real emails):
- "New Renter Lead for <home>": name, relay email (reaches the prospect),
  phone, message, plus credit/income details we ignore.
- "New Prospect Message Alert for <home>": name and message only. No email or
  phone, and no Reply-To, so an email reply goes to donotreply. Only a reply
  inside AffordableHousing reaches them.
- fgwleasing@gmail.com auto-forwards both to stephen@fgwgroups.com.

Email the prospect gets (Richardson example):

    Subject: Touring 48 S Richardson Ave

    Hi Jane,

    Thanks for your interest in 48 S Richardson Ave. It's 2 bedrooms, 1 bath,
    $1,400 a month, available now.

    I can show it Tuesday, Nov 17 at 11:00 AM or 4:00 PM. Text 614-820-5332
    with the time that works for you, or suggest another time, and we'll get
    you on the schedule.

    We got your message and can answer your questions by text too.

    FGW Property Management
    614-820-5332

(The last line before the signature only appears when they wrote a message.
Times: next Mon-Sat day at least 18 hours out, 11 AM and 4 PM, matching the
agent's tour hours. George still confirms the actual tour.)

Install: see the header of ah-instant-reply.gs. Ships with SEND_ENABLED=false.

## 2. Texting registration (draft, NOT submitted)

Twilio's docs (Nov 2026): a VERIFIED campaign can't be edited. Changing it
means deleting and recreating it, which stops all texting on the number
(agent and Sarah) until re-vetting finishes (up to 5 business days) and costs
a new $15 vetting fee. So the option is a SECOND campaign on the same brand,
on its own messaging service and number, used only for listing-site leads.

Risk: carriers want the consent wording the person saw to name the business
and say what texts they'll get. AffordableHousing's inquiry form would have to
show that; nothing in the lead emails suggests it does (form itself not
checked). Rejection is likely without it.

Draft campaign text, if pursued:
- Use case: Low Volume Mixed (customer care, marketing off).
- Description: FGW Investment Properties LLC replies to rental inquiries
  about its homes to answer questions and schedule in-person tours.
- Message flow: A renter submits an inquiry with their phone number on a
  listing site (AffordableHousing.com) for an FGW home. The inquiry form states
  the renter agrees to be contacted by the property manager by phone or text
  about that home. FGW sends one reply about that inquiry; further texts only
  if the renter responds. Every first text says Reply STOP to opt out.
- Sample 1: FGW Property Management: Hi Jane, thanks for asking about 48 S
  Richardson Ave. I can show it Tue at 11:00 AM or 4:00 PM. Which works?
  Reply STOP to opt out.
- Sample 2: FGW Property Management: Your tour of 48 S Richardson Ave is
  confirmed for Tue at 4:00 PM. Reply STOP to opt out.

Lower-risk alternative: add "Text TOUR to 614-820-5332 to see it" to the
AffordableHousing and Zillow listing text. Renters who text first are already
covered, with no new registration.

## Tracker (Nov 16)

- Tracker: FGW Leasing Tracker – Showings & Prospects, shared with fgwleasing@gmail.com as editor. SHEET_ID is filled in the script.
- AffordableHousing leads land in a new tab, "AffordableHousing leads" (the Sarah tabs are left alone).
- Texting agent leads: the same script has a `doPost` web app. Run `setupAgentWebhook()`, deploy as a web app (execute as Me, access Anyone), then set `TRACKER_WEBHOOK_URL` and `TRACKER_WEBHOOK_TOKEN` on Render. The agent then keeps one row per texting prospect in the "Texting agent leads" tab, updated after every text and every tour change. Off until both are set. No income, household or credit details are sent.
