import * as profileRepository from '../data/repositories/profileRepository';

/** Offered in the pronouns box; anything else can be typed. */
export const PRONOUN_SUGGESTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any pronouns'];

export function getProfile() {
  return profileRepository.getProfile();
}

/** Trims names and pronouns; blank pronouns are sent as null to clear them. */
export function saveProfile(changes) {
  const body = { ...changes };
  for (const key of ['First_Name', 'Last_Name']) {
    if (typeof body[key] === 'string') body[key] = body[key].trim();
  }
  if ('Pronouns' in body) body.Pronouns = body.Pronouns?.trim() || null;
  return profileRepository.updateProfile(body);
}

/** "Sam Student (she/her)" when pronouns are set. */
export function withPronouns(name, pronouns) {
  return pronouns ? `${name} (${pronouns})` : name;
}
