import { PublicProfile } from '../../../shared/models/public-profile.model';
import { UserClass } from '../../../shared/models/user.model';

export type CompatibilitySignalKey =
  | 'sharedInterests'
  | 'similarGoal'
  | 'sexualOrientation'
  | 'zodiac'
  | 'familyPlans'
  | 'communicationStyle'
  | 'loveStyle'
  | 'freeTimeAct'
  | 'pets'
  | 'drinking'
  | 'smoking'
  | 'workout';

export type CompatibilitySignal = {
  key: CompatibilitySignalKey;
  icon: string;
  params?: Record<string, unknown>;
  ratio: number;
  weight: number;
};

type CompatibilityResult = {
  score: number;
  signals: CompatibilitySignal[];
  sharedInterests: string[];
};

const INTEREST_ALIASES: Record<string, string> = {
  asztrologia: 'astrology',
  astrology: 'astrology',
  festeszet: 'painting',
  painting: 'painting',
  muveszet: 'art',
  art: 'art',
  'egyejszakas kalandok': 'oneNightStands',
  'one night stands': 'oneNightStands',
  'uj ismeretsegek kotese': 'makingFriends',
  'making new friends': 'makingFriends',
  zenehallgatas: 'listeningToMusic',
  'listening to music': 'listeningToMusic',
  travel: 'travel',
  music: 'music',
  'dog lover': 'dogLover',
  coffee: 'coffee',
  'grab a drink': 'grabADrink',
  foodie: 'foodie',
  brunch: 'brunch',
  wine: 'wine',
  hiking: 'hiking',
  gym: 'gym',
};

const ZODIAC_ALIASES: Record<string, string> = {
  aries: 'aries',
  kos: 'aries',
  taurus: 'taurus',
  bika: 'taurus',
  gemini: 'gemini',
  ikrek: 'gemini',
  cancer: 'cancer',
  rak: 'cancer',
  leo: 'leo',
  oroszlan: 'leo',
  virgo: 'virgo',
  szuz: 'virgo',
  libra: 'libra',
  merleg: 'libra',
  scorpio: 'scorpio',
  skorpio: 'scorpio',
  sagittarius: 'sagittarius',
  nyilas: 'sagittarius',
  capricorn: 'capricorn',
  bak: 'capricorn',
  aquarius: 'aquarius',
  vizonto: 'aquarius',
  pisces: 'pisces',
  halak: 'pisces',
};

const ZODIAC_ELEMENTS: Record<string, 'fire' | 'earth' | 'air' | 'water'> = {
  aries: 'fire',
  leo: 'fire',
  sagittarius: 'fire',
  taurus: 'earth',
  virgo: 'earth',
  capricorn: 'earth',
  gemini: 'air',
  libra: 'air',
  aquarius: 'air',
  cancer: 'water',
  scorpio: 'water',
  pisces: 'water',
};

const OPPOSITE_SIGNS: Record<string, string> = {
  aries: 'libra',
  libra: 'aries',
  taurus: 'scorpio',
  scorpio: 'taurus',
  gemini: 'sagittarius',
  sagittarius: 'gemini',
  cancer: 'capricorn',
  capricorn: 'cancer',
  leo: 'aquarius',
  aquarius: 'leo',
  virgo: 'pisces',
  pisces: 'virgo',
};

const COMPLEMENTARY_ELEMENTS: Record<string, string> = {
  fire: 'air',
  air: 'fire',
  earth: 'water',
  water: 'earth',
};

export function calculateMatchCompatibility(
  userProfile?: Partial<UserClass> | null,
  matchProfile?: PublicProfile | null
): CompatibilityResult {
  const signals = [
    buildArraySignal(
      'sharedInterests',
      'heart-outline',
      userProfile?.interests,
      matchProfile?.interests,
      24,
      normalizeInterest
    ),
    buildExactSignal(
      'similarGoal',
      'sparkles-outline',
      userProfile?.lookingForType,
      matchProfile?.lookingForType,
      12
    ),
    buildExactSignal(
      'sexualOrientation',
      'heart-outline',
      userProfile?.sexualOrientation,
      matchProfile?.sexualOrientation,
      10
    ),
    buildZodiacSignal(userProfile?.zodiacSign, matchProfile?.zodiacSign),
    buildExactSignal(
      'familyPlans',
      'people-outline',
      userProfile?.familyPlans,
      matchProfile?.familyPlans,
      8
    ),
    buildExactSignal(
      'communicationStyle',
      'chatbubble-ellipses-outline',
      userProfile?.communicationStyle,
      matchProfile?.communicationStyle,
      7
    ),
    buildExactSignal(
      'loveStyle',
      'heart-outline',
      userProfile?.loveStyle,
      matchProfile?.loveStyle,
      7
    ),
    buildArraySignal(
      'freeTimeAct',
      'barbell-outline',
      userProfile?.freeTimeAct,
      matchProfile?.freeTimeAct,
      10,
      normalizeText
    ),
    buildExactSignal('pets', 'paw-outline', userProfile?.pets, matchProfile?.pets, 5),
    buildExactSignal(
      'drinking',
      'wine-outline',
      userProfile?.drinking,
      matchProfile?.drinking,
      5
    ),
    buildExactSignal(
      'smoking',
      'sparkles-outline',
      userProfile?.smoking,
      matchProfile?.smoking,
      5
    ),
    buildExactSignal(
      'workout',
      'barbell-outline',
      userProfile?.workout,
      matchProfile?.workout,
      5
    ),
  ].filter((signal): signal is CompatibilitySignal => !!signal);

  const availableWeight = signals.reduce((total, signal) => total + signal.weight, 0);
  const matchedWeight = signals.reduce(
    (total, signal) => total + signal.weight * signal.ratio,
    0
  );
  const sharedInterests = getSharedValues(
    normalizeArray(userProfile?.interests, normalizeInterest),
    normalizeArray(matchProfile?.interests, normalizeInterest)
  );

  return {
    score: availableWeight ? Math.round((matchedWeight / availableWeight) * 100) : 0,
    signals,
    sharedInterests,
  };
}

export function isSharedProfileInterest(
  userProfile: Partial<UserClass> | undefined | null,
  interest: unknown
) {
  const normalizedInterest = normalizeInterest(interest);

  if (!normalizedInterest) {
    return false;
  }

  return (userProfile?.interests ?? []).some(
    (myInterest) => normalizeInterest(myInterest) === normalizedInterest
  );
}

function buildExactSignal(
  key: CompatibilitySignalKey,
  icon: string,
  userValue: unknown,
  matchValue: unknown,
  weight: number
) {
  const normalizedUserValue = normalizeText(userValue);
  const normalizedMatchValue = normalizeText(matchValue);

  if (!normalizedUserValue || !normalizedMatchValue) {
    return null;
  }

  return {
    key,
    icon,
    ratio: normalizedUserValue === normalizedMatchValue ? 1 : 0,
    weight,
  };
}

function buildArraySignal(
  key: CompatibilitySignalKey,
  icon: string,
  userValues: unknown,
  matchValues: unknown,
  weight: number,
  normalize: (value: unknown) => string
) {
  const normalizedUserValues = normalizeArray(userValues, normalize);
  const normalizedMatchValues = normalizeArray(matchValues, normalize);

  if (!normalizedUserValues.length || !normalizedMatchValues.length) {
    return null;
  }

  const sharedValues = getSharedValues(
    normalizedUserValues,
    normalizedMatchValues
  );
  const unionSize = getUnionSize(normalizedUserValues, normalizedMatchValues);

  return {
    key,
    icon,
    params: { count: sharedValues.length },
    ratio: sharedValues.length / unionSize,
    weight,
  };
}

function buildZodiacSignal(userSign: unknown, matchSign: unknown) {
  const normalizedUserSign = normalizeZodiacSign(userSign);
  const normalizedMatchSign = normalizeZodiacSign(matchSign);

  if (!normalizedUserSign || !normalizedMatchSign) {
    return null;
  }

  return {
    key: 'zodiac' as const,
    icon: 'moon-outline',
    ratio: getZodiacCompatibilityRatio(normalizedUserSign, normalizedMatchSign),
    weight: 10,
  };
}

function getSharedValues(
  userValues: Array<{ raw: string; normalized: string }>,
  matchValues: Array<{ raw: string; normalized: string }>
) {
  const myValueSet = new Set(userValues.map((item) => item.normalized));
  const shared: string[] = [];
  const seen = new Set<string>();

  matchValues.forEach((matchValue) => {
    if (
      myValueSet.has(matchValue.normalized) &&
      !seen.has(matchValue.normalized)
    ) {
      seen.add(matchValue.normalized);
      shared.push(matchValue.raw);
    }
  });

  return shared;
}

function getUnionSize(
  userValues: Array<{ raw: string; normalized: string }>,
  matchValues: Array<{ raw: string; normalized: string }>
) {
  return new Set([...userValues, ...matchValues].map((item) => item.normalized)).size;
}

function normalizeArray(
  value: unknown,
  normalize: (value: unknown) => string
) {
  return (Array.isArray(value) ? value : [])
    .map((rawValue) => ({
      raw: String(rawValue),
      normalized: normalize(rawValue),
    }))
    .filter((item) => !!item.normalized);
}

function getZodiacCompatibilityRatio(userSign: string, matchSign: string) {
  if (userSign === matchSign) {
    return 1;
  }

  const userElement = ZODIAC_ELEMENTS[userSign];
  const matchElement = ZODIAC_ELEMENTS[matchSign];

  if (!userElement || !matchElement) {
    return 0;
  }

  if (userElement === matchElement) {
    return 0.9;
  }

  if (COMPLEMENTARY_ELEMENTS[userElement] === matchElement) {
    return 0.8;
  }

  if (OPPOSITE_SIGNS[userSign] === matchSign) {
    return 0.45;
  }

  return 0.35;
}

function normalizeZodiacSign(value: unknown) {
  const normalized = normalizeText(value);

  return ZODIAC_ALIASES[normalized] ?? normalized;
}

function normalizeInterest(value: unknown) {
  const normalized = normalizeText(value);

  return INTEREST_ALIASES[normalized] ?? normalized;
}

function normalizeText(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : '';
}
