/**
 * The one spelling an account's email is stored and looked up under.
 *
 * RIT mail answers to both username@rit.edu and username@g.rit.edu, and Google
 * signs RIT people in as g.rit.edu. Saving whichever an admin typed made the
 * same person two accounts, so RIT addresses always become g.rit.edu.
 */
export function canonicalEmail(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  return normalized.replace(/@rit\.edu$/, '@g.rit.edu');
}
