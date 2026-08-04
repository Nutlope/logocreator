// The free-credit contract, shared by the client UI and the API routes so the
// caption, the welcome pitch and the server ledger can never drift apart.
// 1 credit = 1 generated image (that's the unit that costs real money).
export const FREE_CREDITS = 2;

// Upstash key holding how many free credits a signed-in user has spent.
// Durable on purpose: the allotment is a one-time welcome gift, not a window
// that refills (refilling would make the owner's key a slow faucet).
export const creditsKey = (userId: string) => `logocreator:credits:${userId}`;
