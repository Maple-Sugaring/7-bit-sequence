import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/data/repositories/profileRepository', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(async (body) => body),
}));

import * as profileRepository from '../src/data/repositories/profileRepository';
import { toSessionUser } from '../src/services/authService';
import { PRONOUN_SUGGESTIONS, saveProfile, withPronouns } from '../src/services/profileService';

describe('profile service', () => {
  beforeEach(() => {
    profileRepository.updateProfile.mockClear();
  });

  test('trims names and pronouns before saving', async () => {
    await saveProfile({ First_Name: '  Sam ', Last_Name: ' Student  ', Pronouns: ' they/them ' });
    expect(profileRepository.updateProfile).toHaveBeenCalledWith({
      First_Name: 'Sam',
      Last_Name: 'Student',
      Pronouns: 'they/them',
    });
  });

  test('blank pronouns are sent as null so the server clears them', async () => {
    await saveProfile({ Pronouns: '   ' });
    expect(profileRepository.updateProfile).toHaveBeenCalledWith({ Pronouns: null });
  });

  test('a preference-only save sends just that switch', async () => {
    await saveProfile({ Email_Shifts: false });
    expect(profileRepository.updateProfile).toHaveBeenCalledWith({ Email_Shifts: false });
  });

  test('names show pronouns only when set', () => {
    expect(withPronouns('Sam Student', 'she/her')).toBe('Sam Student (she/her)');
    expect(withPronouns('Sam Student', null)).toBe('Sam Student');
    expect(withPronouns('Sam Student', '')).toBe('Sam Student');
  });

  test('suggestions fit the 40-character server limit', () => {
    for (const option of PRONOUN_SUGGESTIONS) expect(option.length).toBeLessThanOrEqual(40);
  });

  test('the session user carries pronouns so the top bar updates after a save', () => {
    const user = toSessionUser({
      UserID: 2,
      First_Name: 'Sam',
      Last_Name: 'Student',
      Pronouns: 'he/him',
      Email: 'sam@g.rit.edu',
      RoleID: 2,
    });
    expect(user.fullName).toBe('Sam Student');
    expect(user.pronouns).toBe('he/him');
    expect(toSessionUser({ UserID: 3, First_Name: 'A', Last_Name: '', RoleID: 2 }).pronouns).toBeNull();
  });
});
