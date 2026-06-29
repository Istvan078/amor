import * as admin from 'firebase-admin';

export const MINIMUM_DATING_AGE = 18;

const toDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'object') {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };

    if (typeof maybeTimestamp.toDate === 'function') {
      const date = maybeTimestamp.toDate();

      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (Number.isFinite(maybeTimestamp.seconds)) {
      return new Date(Number(maybeTimestamp.seconds) * 1000);
    }
  }

  return null;
};

export const calculateAge = (birthDateValue: unknown, now = new Date()) => {
  const birthDate = toDate(birthDateValue);

  if (!birthDate || birthDate.getTime() > now.getTime()) {
    return undefined;
  }

  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayPassed =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (
      now.getUTCMonth() === birthDate.getUTCMonth() &&
      now.getUTCDate() >= birthDate.getUTCDate()
    );

  if (!birthdayPassed) {
    age--;
  }

  return age;
};

export const getProfileAge = (
  profile: Record<string, unknown>,
  now = new Date()
) => {
  const ageFromBirthDate =
    calculateAge(profile.birthDate, now) ??
    calculateAge(profile.birthDateTimestamp, now);

  if (Number.isFinite(ageFromBirthDate)) {
    return ageFromBirthDate;
  }

  const storedAge = Number(profile.age);

  return Number.isFinite(storedAge) && storedAge > 0
    ? storedAge
    : undefined;
};

export const isAdultProfile = (
  profile: Record<string, unknown>,
  now = new Date()
) => {
  const age = getProfileAge(profile, now);

  return Number.isFinite(age) && Number(age) >= MINIMUM_DATING_AGE;
};
