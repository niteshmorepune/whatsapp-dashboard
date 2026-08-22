/**
 * A bounded set of phrases that, taken as an inbound message's ENTIRE
 * content (after trimming/lowercasing/stripping trailing punctuation), are
 * treated as a request to stop receiving messages. Deliberately an exact-
 * phrase match, never a substring match — "stop by tomorrow" or "I'll stop
 * the payment" must never false-positive into opting a real contact out.
 */
const OPT_OUT_PHRASES = new Set([
  "stop",
  "stop promotions",
  "stop promotion",
  "stop messages",
  "stop messaging",
  "stop messaging me",
  "stop texting",
  "stop texting me",
  "stop sending messages",
  "stop sending promotions",
  "unsubscribe",
  "opt out",
  "optout",
  "opt-out",
  "no more messages",
  "no more promotions",
  "no more marketing",
  "remove me",
  "remove me from this list",
  "remove me from your list",
  "don't message me",
  "dont message me",
  "do not message me",
  "don't message me again",
  "do not message me again",
  "don't contact me",
  "dont contact me",
  "do not contact me",
  "don't contact me again",
  "do not contact me again",
  "please stop",
  "please stop messaging",
  "please stop messaging me",
  "please unsubscribe",
]);

export function isOptOutMessage(content: string): boolean {
  const normalized = content
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/g, "")
    .trim();

  return OPT_OUT_PHRASES.has(normalized);
}
