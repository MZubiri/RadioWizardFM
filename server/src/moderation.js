// Rate limit config: 1 message per 2 seconds per socket
const RATE_LIMIT_MS = 2000;
const lastMessageTimes = new Map();

export function checkRateLimit(socketId) {
  const now = Date.now();
  const lastMessageTime = lastMessageTimes.get(socketId);

  if (lastMessageTime && now - lastMessageTime < RATE_LIMIT_MS) {
    return false; // Rate limit exceeded
  }

  lastMessageTimes.set(socketId, now);

  // Cleanup old entries randomly to avoid memory leaks
  if (Math.random() < 0.01) {
    for (const [id, time] of lastMessageTimes.entries()) {
      if (now - time > RATE_LIMIT_MS * 2) {
        lastMessageTimes.delete(id);
      }
    }
  }

  return true;
}

const BANNED_WORDS = [
  'voldemort', 'avada kedavra', 'crucio', 'imperio', 'mudblood'
];

export function filterMessage(text) {
  if (!text) return text;

  const lowerText = text.toLowerCase();

  // Check for banned words
  for (const word of BANNED_WORDS) {
    if (lowerText.includes(word)) {
      return null;
    }
  }

  return text.substring(0, 500); // Limit length
}
