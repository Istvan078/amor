export type TranslationFn = (key: string) => string;

const PROFILE_VALUE_TRANSLATION_KEYS: Record<string, string> = {
  man: 'profile.values.man',
  woman: 'profile.values.woman',
  other: 'profile.values.other',
  Ferfi: 'profile.values.man',
  No: 'profile.values.woman',
  Egyeb: 'profile.values.other',
  seriousRelationship: 'profile.values.relationshipGoal.seriousRelationship',
  seriousOpenMinded: 'profile.values.relationshipGoal.seriousOpenMinded',
  casualOpenToSerious: 'profile.values.relationshipGoal.casualOpenToSerious',
  casualRelationship: 'profile.values.relationshipGoal.casualRelationship',
  newFriends: 'profile.values.relationshipGoal.newFriends',
  stillFiguringItOut: 'profile.values.relationshipGoal.stillFiguringItOut',
  heterosexual: 'profile.values.sexualOrientation.heterosexual.title',
  gay: 'profile.values.sexualOrientation.gay.title',
  lesbian: 'profile.values.sexualOrientation.lesbian.title',
  bisexual: 'profile.values.sexualOrientation.bisexual.title',
  asexual: 'profile.values.sexualOrientation.asexual.title',
  demisexual: 'profile.values.sexualOrientation.demisexual.title',
  pansexual: 'profile.values.sexualOrientation.pansexual.title',
  queer: 'profile.values.sexualOrientation.queer.title',
  questioning: 'profile.values.sexualOrientation.questioning.title',
  aromantic: 'profile.values.sexualOrientation.aromantic.title',
  omnisexual: 'profile.values.sexualOrientation.omnisexual.title',
  Foci: 'profile.values.football',
  Kezilabda: 'profile.values.handball',
  Meditacio: 'profile.values.meditation',
  Onfejlesztes: 'profile.values.selfDevelopment',
  Olvasas: 'profile.values.reading',
  Edzes: 'profile.values.training',
  Asztrologia: 'profile.values.astrology',
  Festeszet: 'profile.values.painting',
  Muveszet: 'profile.values.art',
  'Egyejszakas kalandok': 'profile.values.oneNightStands',
  'Uj ismeretsegek kotese': 'profile.values.makingFriends',
  Zenehallgatas: 'profile.values.listeningToMusic',
  Travel: 'profile.values.travel',
  Music: 'profile.values.music',
  'Dog lover': 'profile.values.dogLover',
  Coffee: 'profile.values.coffee',
  'Grab a drink': 'profile.values.grabADrink',
  Foodie: 'profile.values.foodie',
  Brunch: 'profile.values.brunch',
  Wine: 'profile.values.wine',
  Hiking: 'profile.values.hiking',
  Gym: 'profile.values.gym',
  Aries: 'profile.values.zodiac.aries',
  Taurus: 'profile.values.zodiac.taurus',
  Gemini: 'profile.values.zodiac.gemini',
  Cancer: 'profile.values.zodiac.cancer',
  Leo: 'profile.values.zodiac.leo',
  Virgo: 'profile.values.zodiac.virgo',
  Libra: 'profile.values.zodiac.libra',
  Scorpio: 'profile.values.zodiac.scorpio',
  Sagittarius: 'profile.values.zodiac.sagittarius',
  Capricorn: 'profile.values.zodiac.capricorn',
  Aquarius: 'profile.values.zodiac.aquarius',
  Pisces: 'profile.values.zodiac.pisces',
  'Want kids': 'profile.values.familyPlans.wantKids',
  'Do not want kids': 'profile.values.familyPlans.doNotWantKids',
  'Have kids': 'profile.values.familyPlans.haveKids',
  'Open to kids': 'profile.values.familyPlans.openToKids',
  'Not sure yet': 'profile.values.familyPlans.notSureYet',
  'Better in person': 'profile.values.communicationStyle.betterInPerson',
  'Texting all day': 'profile.values.communicationStyle.textingAllDay',
  'Phone caller': 'profile.values.communicationStyle.phoneCaller',
  'Video chatter': 'profile.values.communicationStyle.videoChatter',
  'Thoughtful gestures': 'profile.values.loveStyle.thoughtfulGestures',
  'Quality time': 'profile.values.loveStyle.qualityTime',
  'Words of affirmation': 'profile.values.loveStyle.wordsOfAffirmation',
  'Physical touch': 'profile.values.loveStyle.physicalTouch',
  'Acts of service': 'profile.values.loveStyle.actsOfService',
  'Have pets': 'profile.values.pets.havePets',
  'Do not have pets': 'profile.values.pets.doNotHavePets',
  'Do not have, but love': 'profile.values.pets.lovePets',
  'Allergic to pets': 'profile.values.pets.allergic',
  'Never drinks': 'profile.values.drinking.never',
  'On special occasions': 'profile.values.drinking.specialOccasions',
  'Socially, at the weekend': 'profile.values.drinking.weekend',
  'Socially active drinking': 'profile.values.drinking.sociallyActive',
  'Non-smoker': 'profile.values.smoking.nonSmoker',
  'Social smoker': 'profile.values.smoking.socialSmoker',
  Smoker: 'profile.values.smoking.smoker',
  'Never works out': 'profile.values.workout.never',
  Sometimes: 'profile.values.workout.sometimes',
  Often: 'profile.values.workout.often',
  'Every day': 'profile.values.workout.everyDay',
  'Not for me': 'profile.values.socialMedia.notForMe',
  'Passive scroller': 'profile.values.socialMedia.passiveScroller',
  'Socially active': 'profile.values.socialMedia.sociallyActive',
  'Content creator': 'profile.values.socialMedia.contentCreator',
};

export function translatedFieldLabel(t: TranslationFn, field: any): string {
  return field?.valueKey ? t(field.valueKey) : field?.value ?? '';
}

export function translatedFieldPlaceholder(
  t: TranslationFn,
  field: any
): string {
  return field?.placeholderKey ? t(field.placeholderKey) : field?.placeholder ?? '';
}

export function translatedOptionLabel(
  t: TranslationFn,
  field: any,
  index: number
): string {
  const key = field?.optionLabelKeys?.[index];

  return key ? t(key) : field?.options?.[index] ?? '';
}

export function translatedChoiceLabel(t: TranslationFn, choice: any): string {
  return choice?.labelKey ? t(choice.labelKey) : choice?.value ?? '';
}

export function translatedProfileValue(t: TranslationFn, value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'object') {
    const range = value as { lower?: number; upper?: number };

    if (typeof range.lower === 'number' && typeof range.upper === 'number') {
      return `${range.lower} - ${range.upper}`;
    }

    return '';
  }

  const rawValue = String(value);
  const translationKey = PROFILE_VALUE_TRANSLATION_KEYS[rawValue];

  return translationKey ? t(translationKey) : rawValue;
}
