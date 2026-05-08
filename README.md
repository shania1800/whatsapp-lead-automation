# WhatsApp Lead Automation System

A two-workflow automation system that handles outbound prospecting and inbound AI-powered conversation for a WhatsApp-based B2B lead generation service targeting small businesses.

Built and operated as a live production system, not a demo project.

---

## What It Does

**Outbound (W1):** Sends personalized cold outreach messages to a database of ~500 local business leads via WhatsApp, on a scheduled cadence during business hours, tracking status per lead to avoid repeat contacts.

**Inbound (W2):** Receives replies, retrieves conversation history, runs an AI analysis pass, generates a contextually appropriate next message following a structured sales flow, logs everything, and sends real-time notifications for hot/warm leads.

---

## Architecture

```
+-----------------------------------------------------------------+
|                        W1 - OUTBOUND                            |
|                                                                 |
|  Schedule (25min) -> Business Hours Check -> Supabase (pending) |
|       -> Personalized Message -> Twilio/WhatsApp -> Update Status |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------+
|                        W2 - INBOUND                             |
|                                                                 |
|  Twilio Webhook -> Validate -> Phone Sanitize -> Unsubscribe Check |
|       -> Log Inbound -> Fetch Lead Record                       |
|                                                                 |
|  [Known lead?]                                                  |
|       YES -> Fetch Conversation History (Supabase)              |
|       NO  -> Greeting Response                                  |
|                                                                 |
|  Prepare AI Context (JS: state machine + prompt)                |
|       -> OpenAI GPT-4o-mini                                     |
|       -> Parse JSON Response                                    |
|       -> Merge with Context                                     |
|       -> Send via Twilio -> Log Outbound -> Webhook 200 OK      |
+-----------------------------------------------------------------+
```

---

## Tech Stack

| Layer | Tool |
|---|---|
| Workflow automation | n8n (self-hosted) |
| Messaging | Twilio WhatsApp API |
| Database | Supabase (PostgreSQL) |
| AI | OpenAI GPT-4o-mini |
| Language | JavaScript (n8n Code nodes) |
| Brand assets | Python + Pillow |

---

## Conversation Flow (W2 State Machine)

The AI does not freestyle. Every inbound message is evaluated against a structured 6-step sales flow:

```
STEP 1  GREETING      -> "Hey! I help businesses answer all their WhatsApp
                          messages 24/7, is that something you're interested in?"

STEP 2  VOLUME        -> "Great! How many WhatsApp messages do you typically
                          get per day?"

STEP 3  OFFER DEMO    -> "Got it, that's a lot to handle manually. Want me
                          to have a team member show you how this works?
                          Takes about 10 minutes."

STEP 4  COLLECT EMAIL -> "What's your email address?"

STEP 5  COLLECT TIME  -> "Thanks! What time works best for you today or tomorrow?"

STEP 6  CONFIRM       -> "All set, a team member will reach out to you ASAP."
```

Step detection uses a combination of conversation history flags and latest-message-only parsing. Volume, email, and time are only considered "provided" if they appear in the customer's latest message, not anywhere in history. This prevents false positives from phrases like "24/7" or "10 minutes" triggering early step advancement.

---

## Key Engineering Decisions

### `conversation_stage` as Single Source of Truth
Conversation state is tracked in Supabase rather than re-derived from message content on each turn. This eliminates an entire class of looping bugs where keyword detection would misfire on ambiguous history.

### Phone Number Sanitization
Twilio's webhook payload injects `\n` characters into phone numbers. Without cleaning, every lookup fails silently.

Fix applied at two levels:
- SQL: `REPLACE(phone_number, chr(10), '')`
- n8n: `.replace(/\s+/g, '').trim()`

### Silent Failure Prevention
The send node and status-update node are deliberately decoupled with error handling between them. Without this, a failed send would still mark a lead as "Contacted" and the lead would never be retried with no error surfacing.

### Context Loss After HTTP Requests
n8n's `$json` loses upstream context after HTTP Request nodes. All downstream nodes reference named nodes explicitly:

```javascript
// Wrong - loses context after HTTP node
const phone = $json.customer_phone;

// Correct
const phone = $('Prepare AI Context').item.json.customer_phone;
```

### `Merge By Position` Load-Bearing Role
`Prepare AI Context` fans out to both OpenAI and the Merge node. The Merge node waits for the OpenAI response, then combines it with the original context (customer_phone, customer_name, etc., fields that are gone from `$json` after the HTTP call). Removing this node breaks phone number propagation to the send and log steps.

---

## Database Schema (Supabase)

### `whatsapp_leads`
```sql
id              uuid PRIMARY KEY
business_name   text
contact_name    text
phone_number    text UNIQUE
status          text  -- 'pending' | 'Contacted' | 'unsubscribed'
created_at      timestamptz
```

### `conversations`
```sql
id              uuid PRIMARY KEY
phone_number    text
direction       text  -- 'inbound' | 'outbound'
message_text    text
sentiment       text
timestamp       timestamptz DEFAULT now()
```

---

## Operational Notes

- Outbound runs every 25 minutes, business hours only (8am to 5pm ET)
- Business hours enforced via n8n If node evaluating `toLocaleString('en-US', {timeZone: 'America/New_York'})`
- One lead contacted per run, intentionally conservative to stay within WhatsApp messaging policy
- Inbound webhook responds `200 OK` immediately regardless of processing outcome, to prevent Twilio retry storms
- AI responses are capped at 1-2 sentences; prompt explicitly forbids using the words "automation" or "AI"

---

## What's Not in This Repo

- Twilio credentials and Supabase keys (environment variables)
- The full leads database
- n8n workflow JSON exports with live credentials

The workflow logic, prompt engineering, state machine design, and architecture decisions are the substance of this project. The credentials are not.

---

## Status

Live and in production. Ongoing work includes:

- Diagnosing a campaign pause in mid-April (suspected Twilio account flag)
- Refining the demo-booking step to enforce a specific date/time rather than accepting vague answers
- Evaluating GoHighLevel as a scaling layer once paying clients are onboarded
