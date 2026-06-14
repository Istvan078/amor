const MINIMUM_DATING_AGE = 18;
const DEFAULT_MAX_LOOKING_FOR_AGE = 100;

export const normalizeLookingForAgeRange = (value: unknown) => {
  const range =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const lower = Number(range.lower);
  const upper = Number(range.upper);
  const normalizedLower = Number.isFinite(lower)
    ? Math.max(MINIMUM_DATING_AGE, lower)
    : MINIMUM_DATING_AGE;
  const normalizedUpper = Number.isFinite(upper)
    ? Math.max(normalizedLower, upper)
    : DEFAULT_MAX_LOOKING_FOR_AGE;

  return {
    lower: normalizedLower,
    upper: Math.max(normalizedLower, normalizedUpper),
  };
};
