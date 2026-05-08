-- ============================================================
-- WhatsApp Lead Automation — Supabase Schema
-- ============================================================


-- -------------------------------------------------------
-- whatsapp_leads
-- Source of truth for outbound prospecting targets.
-- W1 reads 'pending' records and updates to 'Contacted'.
-- -------------------------------------------------------

CREATE TABLE whatsapp_leads (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name  text NOT NULL,
  contact_name   text,
  phone_number   text UNIQUE NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
    -- Values: 'pending' | 'Contacted' | 'unsubscribed'
  created_at     timestamptz DEFAULT now()
);

-- Index for W1's status-filtered lead fetch
CREATE INDEX idx_leads_status ON whatsapp_leads (status);

-- Phone number cleanup (run once if data was imported with \n chars)
UPDATE whatsapp_leads
SET phone_number = REPLACE(phone_number, chr(10), '')
WHERE phone_number LIKE '%' || chr(10) || '%';


-- -------------------------------------------------------
-- conversations
-- Full message log for every inbound and outbound message.
-- W2 reads this for AI context and writes to it after each turn.
-- -------------------------------------------------------

CREATE TABLE conversations (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number   text NOT NULL,
  business_name  text,
  direction      text NOT NULL,
    -- Values: 'inbound' | 'outbound'
  message_text   text,
  sentiment      text,
    -- Values: 'positive' | 'negative' | 'neutral'
  timestamp      timestamptz DEFAULT now()
);

-- Index for conversation history fetch (W2 reads by phone_number)
CREATE INDEX idx_conversations_phone ON conversations (phone_number);
CREATE INDEX idx_conversations_timestamp ON conversations (timestamp);


-- -------------------------------------------------------
-- Audit queries — useful for campaign health monitoring
-- -------------------------------------------------------

-- Message counts by date and direction
SELECT
  DATE(timestamp) AS day,
  direction,
  COUNT(*) AS message_count
FROM conversations
GROUP BY day, direction
ORDER BY day DESC;

-- Lead status breakdown
SELECT status, COUNT(*) AS count
FROM whatsapp_leads
GROUP BY status;

-- Leads contacted today
SELECT COUNT(*) FROM whatsapp_leads
WHERE status = 'Contacted'
  AND created_at >= CURRENT_DATE;

-- Reset a lead for retesting
UPDATE whatsapp_leads
SET status = 'pending'
WHERE phone_number = '+1XXXXXXXXXX';
