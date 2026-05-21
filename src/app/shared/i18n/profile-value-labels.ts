export type TranslationFn = (key: string) => string;

const PROFILE_VALUE_TRANSLATION_KEYS: Record<string, string> = {
  Ferfi: 'profile.values.man',
  No: 'profile.values.woman',
  Egyeb: 'profile.values.other',
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
