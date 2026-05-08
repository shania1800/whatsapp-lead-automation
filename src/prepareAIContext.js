/**
 * prepareAIContext.js
 *
 * Builds the AI prompt and state flags for each inbound WhatsApp message.
 * Used inside n8n's Code node as part of the W2 inbound handler.
 *
 * Design principle: Volume, email, and time are ONLY considered "provided"
 * if they appear in the customer's LATEST message — not anywhere in history.
 * This prevents false positives from phrases like "24/7" or "10 minutes"
 * that appear in our own outbound messages.
 */

function prepareAIContext(conversationHistory, customerData) {
  // Sort chronologically
  const sorted = [...conversationHistory].sort(
    (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
  );

  // Build recent conversation window (last 10 messages)
  const recentConversation = sorted
    .filter(msg => msg.message_text)
    .slice(-10)
    .map(msg => {
      const speaker = msg.direction === 'inbound' ? 'Customer' : 'You';
      return `${speaker}: ${msg.message_text}`;
    })
    .join('\n');

  const conversationText = recentConversation.toLowerCase();
  const latestMessageRaw = (customerData.customer_message || '').trim();
  const latestMessage = latestMessageRaw.toLowerCase();

  // State flags — history-based (safe to check full conversation)
  const alreadyGreeted      = recentConversation.includes('You:');
  const askedIfInterested   = /\binterested\b/.test(conversationText) && /You:/.test(recentConversation);
  const askedAboutVolume    = /how many\s+(whatsapp\s+)?messages\b/.test(conversationText);
  const askedAboutDemo      = /\bdemo\b|show you how this works|10 minutes/.test(conversationText);

  // State flags — latest message ONLY (prevents false positives)
  const customerSaidYes     = /\b(yes|yeah|yep|sure|interested|i am)\b/.test(latestMessage);
  const hasVolumeAnswer     = /\b\d+\b/.test(latestMessage);
  const hasEmail            = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(latestMessageRaw);
  const hasTimePreference   = /\b(\d{1,2}(:\d{2})?\s?(am|pm)|morning|afternoon|evening|today|tomorrow)\b/i.test(latestMessageRaw);

  const flags = {
    alreadyGreeted,
    askedIfInterested,
    customerSaidYes,
    askedAboutVolume,
    hasVolumeAnswer,
    askedAboutDemo,
    hasEmail,
    hasTimePreference,
  };

  const prompt = buildPrompt({
    recentConversation,
    latestMessageRaw,
    flags,
  });

  return {
    customer_name: customerData.customer_name || 'there',
    customer_message: customerData.customer_message || '',
    customer_phone: customerData.customer_phone,
    history_count: sorted.length,
    conversation_mode: alreadyGreeted ? 'ongoing' : 'greeting',
    flags,
    prompt,
  };
}

function buildPrompt({ recentConversation, latestMessageRaw, flags }) {
  const {
    alreadyGreeted, askedIfInterested, customerSaidYes,
    askedAboutVolume, hasVolumeAnswer, askedAboutDemo,
    hasEmail, hasTimePreference,
  } = flags;

  return `You are Shania's assistant helping people with WhatsApp message handling.

CONVERSATION HISTORY:
${recentConversation || 'No prior messages.'}

CUSTOMER'S LATEST MESSAGE: "${latestMessageRaw}"

CURRENT STATUS:
- Greeted: ${alreadyGreeted ? 'YES' : 'NO'}
- Asked if interested: ${askedIfInterested ? 'YES' : 'NO'}
- Customer interested (latest msg): ${customerSaidYes ? 'YES' : 'NO'}
- Asked about message volume: ${askedAboutVolume ? 'YES' : 'NO'}
- Customer provided volume (latest msg): ${hasVolumeAnswer ? 'YES' : 'NO'}
- Offered demo: ${askedAboutDemo ? 'YES' : 'NO'}
- Has email (latest msg): ${hasEmail ? 'YES' : 'NO'}
- Has preferred time (latest msg): ${hasTimePreference ? 'YES' : 'NO'}

YOUR CONVERSATION FLOW — Follow in exact order, DO NOT SKIP:

STEP 1 - GREETING (if not greeted yet):
→ "Hey! I help businesses answer all their WhatsApp messages 24/7, is that something you are interested in?"

STEP 2 - ASK MESSAGE VOLUME (only if customer is interested):
→ "Great! How many WhatsApp messages do you typically get per day?"

STEP 3 - OFFER DEMO (only if customer gave a volume number in their latest message AND no demo offered yet):
→ "Got it - that's a lot to handle manually! Want me to have a team member show you how this works? Takes about 10 minutes."

STEP 4 - COLLECT EMAIL (only if customer said yes to demo AND email not collected yet):
→ "What's your email address?"

STEP 5 - COLLECT TIME (only if email collected AND time not collected yet):
→ "Thanks! What time works best for you today or tomorrow?"

STEP 6 - CONFIRM (only if email and time are collected):
→ "All set! A team member will reach out to you ASAP to show you the system. Looking forward to it!"

CRITICAL RULES:
- Follow the steps IN ORDER. Do not skip ahead.
- NEVER ask the same question twice.
- Only treat volume/email/time as provided if in the CUSTOMER'S LATEST MESSAGE.
- Keep responses 1-2 sentences max.
- Use natural language — avoid "automation" and "AI".

Respond ONLY with valid JSON:
{
  "sentiment": "positive/negative/neutral",
  "lead_temperature": "hot/warm/cold",
  "suggested_response": "Your next message",
  "reasoning": "Which step you're on and why"
}`;
}

module.exports = { prepareAIContext };
