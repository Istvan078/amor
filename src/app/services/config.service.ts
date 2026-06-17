import { Injectable, signal } from '@angular/core';

import { Promotions } from '../shared/models/promotions.model';
import { UserClass } from '../shared/models/user.model';

type ProfileSelectOption = {
  value: string;
  labelKey: string;
  descriptionKey?: string;
  emoji?: string;
};

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  labels: any = {};
  promotions: Promotions[] = [];

  private readonly zodiacOptions: ProfileSelectOption[] = [
    { value: 'Aries', labelKey: 'profile.values.zodiac.aries' },
    { value: 'Taurus', labelKey: 'profile.values.zodiac.taurus' },
    { value: 'Gemini', labelKey: 'profile.values.zodiac.gemini' },
    { value: 'Cancer', labelKey: 'profile.values.zodiac.cancer' },
    { value: 'Leo', labelKey: 'profile.values.zodiac.leo' },
    { value: 'Virgo', labelKey: 'profile.values.zodiac.virgo' },
    { value: 'Libra', labelKey: 'profile.values.zodiac.libra' },
    { value: 'Scorpio', labelKey: 'profile.values.zodiac.scorpio' },
    { value: 'Sagittarius', labelKey: 'profile.values.zodiac.sagittarius' },
    { value: 'Capricorn', labelKey: 'profile.values.zodiac.capricorn' },
    { value: 'Aquarius', labelKey: 'profile.values.zodiac.aquarius' },
    { value: 'Pisces', labelKey: 'profile.values.zodiac.pisces' },
  ];

  private readonly familyPlanOptions: ProfileSelectOption[] = [
    { value: 'Want kids', labelKey: 'profile.values.familyPlans.wantKids' },
    { value: 'Do not want kids', labelKey: 'profile.values.familyPlans.doNotWantKids' },
    { value: 'Have kids', labelKey: 'profile.values.familyPlans.haveKids' },
    { value: 'Open to kids', labelKey: 'profile.values.familyPlans.openToKids' },
    { value: 'Not sure yet', labelKey: 'profile.values.familyPlans.notSureYet' },
  ];

  private readonly communicationStyleOptions: ProfileSelectOption[] = [
    { value: 'Better in person', labelKey: 'profile.values.communicationStyle.betterInPerson' },
    { value: 'Texting all day', labelKey: 'profile.values.communicationStyle.textingAllDay' },
    { value: 'Phone caller', labelKey: 'profile.values.communicationStyle.phoneCaller' },
    { value: 'Video chatter', labelKey: 'profile.values.communicationStyle.videoChatter' },
  ];

  private readonly loveStyleOptions: ProfileSelectOption[] = [
    { value: 'Thoughtful gestures', labelKey: 'profile.values.loveStyle.thoughtfulGestures' },
    { value: 'Quality time', labelKey: 'profile.values.loveStyle.qualityTime' },
    { value: 'Words of affirmation', labelKey: 'profile.values.loveStyle.wordsOfAffirmation' },
    { value: 'Physical touch', labelKey: 'profile.values.loveStyle.physicalTouch' },
    { value: 'Acts of service', labelKey: 'profile.values.loveStyle.actsOfService' },
  ];

  private readonly relationshipGoalOptions: ProfileSelectOption[] = [
    {
      value: 'seriousRelationship',
      labelKey: 'profile.values.relationshipGoal.seriousRelationship',
      emoji: '💘',
    },
    {
      value: 'seriousOpenMinded',
      labelKey: 'profile.values.relationshipGoal.seriousOpenMinded',
      emoji: '😍',
    },
    {
      value: 'casualOpenToSerious',
      labelKey: 'profile.values.relationshipGoal.casualOpenToSerious',
      emoji: '🥂',
    },
    {
      value: 'casualRelationship',
      labelKey: 'profile.values.relationshipGoal.casualRelationship',
      emoji: '🎉',
    },
    {
      value: 'newFriends',
      labelKey: 'profile.values.relationshipGoal.newFriends',
      emoji: '👋',
    },
    {
      value: 'stillFiguringItOut',
      labelKey: 'profile.values.relationshipGoal.stillFiguringItOut',
      emoji: '🫠',
    },
  ];

  private readonly sexualOrientationOptions: ProfileSelectOption[] = [
    {
      value: 'heterosexual',
      labelKey: 'profile.values.sexualOrientation.heterosexual.title',
      descriptionKey: 'profile.values.sexualOrientation.heterosexual.description',
    },
    {
      value: 'gay',
      labelKey: 'profile.values.sexualOrientation.gay.title',
      descriptionKey: 'profile.values.sexualOrientation.gay.description',
    },
    {
      value: 'lesbian',
      labelKey: 'profile.values.sexualOrientation.lesbian.title',
      descriptionKey: 'profile.values.sexualOrientation.lesbian.description',
    },
    {
      value: 'bisexual',
      labelKey: 'profile.values.sexualOrientation.bisexual.title',
      descriptionKey: 'profile.values.sexualOrientation.bisexual.description',
    },
    {
      value: 'asexual',
      labelKey: 'profile.values.sexualOrientation.asexual.title',
      descriptionKey: 'profile.values.sexualOrientation.asexual.description',
    },
    {
      value: 'demisexual',
      labelKey: 'profile.values.sexualOrientation.demisexual.title',
      descriptionKey: 'profile.values.sexualOrientation.demisexual.description',
    },
    {
      value: 'pansexual',
      labelKey: 'profile.values.sexualOrientation.pansexual.title',
      descriptionKey: 'profile.values.sexualOrientation.pansexual.description',
    },
    {
      value: 'queer',
      labelKey: 'profile.values.sexualOrientation.queer.title',
      descriptionKey: 'profile.values.sexualOrientation.queer.description',
    },
    {
      value: 'questioning',
      labelKey: 'profile.values.sexualOrientation.questioning.title',
      descriptionKey: 'profile.values.sexualOrientation.questioning.description',
    },
    {
      value: 'aromantic',
      labelKey: 'profile.values.sexualOrientation.aromantic.title',
      descriptionKey: 'profile.values.sexualOrientation.aromantic.description',
    },
    {
      value: 'omnisexual',
      labelKey: 'profile.values.sexualOrientation.omnisexual.title',
      descriptionKey: 'profile.values.sexualOrientation.omnisexual.description',
    },
  ];

  private readonly petsOptions: ProfileSelectOption[] = [
    { value: 'Have pets', labelKey: 'profile.values.pets.havePets' },
    { value: 'Do not have pets', labelKey: 'profile.values.pets.doNotHavePets' },
    { value: 'Do not have, but love', labelKey: 'profile.values.pets.lovePets' },
    { value: 'Allergic to pets', labelKey: 'profile.values.pets.allergic' },
  ];

  private readonly drinkingOptions: ProfileSelectOption[] = [
    { value: 'Never drinks', labelKey: 'profile.values.drinking.never' },
    { value: 'On special occasions', labelKey: 'profile.values.drinking.specialOccasions' },
    { value: 'Socially, at the weekend', labelKey: 'profile.values.drinking.weekend' },
    { value: 'Socially active drinking', labelKey: 'profile.values.drinking.sociallyActive' },
  ];

  private readonly smokingOptions: ProfileSelectOption[] = [
    { value: 'Non-smoker', labelKey: 'profile.values.smoking.nonSmoker' },
    { value: 'Social smoker', labelKey: 'profile.values.smoking.socialSmoker' },
    { value: 'Smoker', labelKey: 'profile.values.smoking.smoker' },
  ];

  private readonly workoutOptions: ProfileSelectOption[] = [
    { value: 'Never works out', labelKey: 'profile.values.workout.never' },
    { value: 'Sometimes', labelKey: 'profile.values.workout.sometimes' },
    { value: 'Often', labelKey: 'profile.values.workout.often' },
    { value: 'Every day', labelKey: 'profile.values.workout.everyDay' },
  ];

  private readonly socialMediaOptions: ProfileSelectOption[] = [
    { value: 'Not for me', labelKey: 'profile.values.socialMedia.notForMe' },
    { value: 'Passive scroller', labelKey: 'profile.values.socialMedia.passiveScroller' },
    { value: 'Socially active', labelKey: 'profile.values.socialMedia.sociallyActive' },
    { value: 'Content creator', labelKey: 'profile.values.socialMedia.contentCreator' },
  ];

  readonly selectedFiles = signal<File[]>([]);
  readonly mainViewInitVersion = signal(0);

  requestMainViewInit() {
    this.mainViewInitVersion.update((version) => version + 1);
  }

  clearSelectedFiles() {
    this.selectedFiles.set([]);
  }

  private selectLabelKeys(options: ProfileSelectOption[]) {
    return options.map((option) => option.labelKey);
  }

  private selectValues(options: ProfileSelectOption[]) {
    return options.map((option) => option.value);
  }

  getLabels(isUserProfL?: boolean, isPromLabels?: boolean) {
    if (isUserProfL) {
      this.labels.userProfLabels = [
        {
          key: 'pictures',
          value: 'Kepeim',
          valueKey: 'profile.fields.pictures',
          type: 'file',
          multiple: true,
          change: (event: any) => this.onFilesSelected(event),
          placeholder: 'Toltsd fel kepeket magadrol',
          placeholderKey: 'profile.placeholders.pictures',
          setLaterInProf: true,
        },
        {
          key: 'aboutMe',
          value: 'Rolam',
          valueKey: 'profile.fields.aboutMe',
          type: 'text-area',
          placeholder: 'Meselj magadrol',
          placeholderKey: 'profile.placeholders.aboutMe',
          setLaterInProf: true,
          inMatch: true,
          listNum: 1,
        },
        {
          key: 'lookingForType',
          value: "I'm looking for",
          valueKey: 'profile.fields.lookingForType',
          type: 'relationship-goal',
          choices: this.relationshipGoalOptions,
          setLaterInProf: true,
          inMatch: true,
          listNum: 1,
        },
        {
          key: 'sexualOrientation',
          value: 'Szexualis orientacio',
          valueKey: 'profile.fields.sexualOrientation',
          type: 'select',
          options: this.selectValues(this.sexualOrientationOptions),
          values: this.selectValues(this.sexualOrientationOptions),
          optionLabelKeys: this.selectLabelKeys(this.sexualOrientationOptions),
          inMatch: true,
          listNum: 1,
        },
        {
          key: 'lookingForAge',
          value: 'Amilyen korban keresek: ',
          valueKey: 'profile.fields.lookingForAge',
          type: 'range',
          inMatch: true,
          listNum: 1,
        },
        {
          key: 'gender',
          value: 'Nemed',
          valueKey: 'profile.fields.gender',
          type: 'select',
          options: ['man', 'woman', 'other'],
          values: ['man', 'woman', 'other'],
          optionLabelKeys: [
            'profile.values.man',
            'profile.values.woman',
            'profile.values.other',
          ],
        },
        {
          key: 'firstName',
          value: 'Keresztneved',
          valueKey: 'profile.fields.firstName',
          type: 'text',
        },
        {
          key: 'lastName',
          value: 'Vezetekneved',
          valueKey: 'profile.fields.lastName',
          type: 'text',
        },
        {
          key: 'userName',
          value: 'Felhasznalonev',
          valueKey: 'profile.fields.userName',
          type: 'text',
        },
        {
          key: 'birthDate',
          value: 'Szuletesi Datum',
          valueKey: 'profile.fields.birthDate',
          type: 'date',
        },
        {
          key: 'hideAge',
          value: 'Eletkor elrejtese',
          valueKey: 'profile.fields.hideAge',
          type: 'premium-toggle',
          descriptionKey: 'profile.premium.hideAge.description',
          premiumLabelKey: 'profile.premium.goldOnly',
        },
        {
          key: 'currentPlace',
          value: 'Jelenlegi helyed',
          valueKey: 'profile.fields.currentPlace',
          type: 'text',
          inMatch: true,
          listNum: 2,
        },
        {
          key: 'lookingForDistance',
          value: 'Milyen tavol legyen? (Max Km)',
          valueKey: 'profile.fields.lookingForDistance',
          type: 'number',
        },
        {
          key: 'age',
          value: 'Kor',
          valueKey: 'profile.fields.age',
          setByApp: true,
          inMatch: true,
          listNum: 2,
        },
        {
          key: 'job',
          value: 'Munkahely',
          valueKey: 'profile.fields.job',
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum: 2,
        },
        {
          key: 'heightCm',
          value: 'Magassag',
          valueKey: 'profile.fields.heightCm',
          type: 'number',
          setLaterInProf: true,
          inMatch: true,
          listNum: 2,
        },
        {
          key: 'highestSchool',
          value: 'Legmagasabb iskolai vegzettseg',
          valueKey: 'profile.fields.highestSchool',
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.highestSchool ? 3 : '';
          },
        },
        {
          key: 'zodiacSign',
          value: 'Csillagjegy',
          valueKey: 'profile.fields.zodiacSign',
          type: 'select',
          options: this.selectValues(this.zodiacOptions),
          values: this.selectValues(this.zodiacOptions),
          optionLabelKeys: this.selectLabelKeys(this.zodiacOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.zodiacSign ? 4 : '';
          },
        },
        {
          key: 'familyPlans',
          value: 'Csaladi tervek',
          valueKey: 'profile.fields.familyPlans',
          type: 'select',
          options: this.selectValues(this.familyPlanOptions),
          values: this.selectValues(this.familyPlanOptions),
          optionLabelKeys: this.selectLabelKeys(this.familyPlanOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.familyPlans ? 4 : '';
          },
        },
        {
          key: 'communicationStyle',
          value: 'Kommunikacios stilus',
          valueKey: 'profile.fields.communicationStyle',
          type: 'select',
          options: this.selectValues(this.communicationStyleOptions),
          values: this.selectValues(this.communicationStyleOptions),
          optionLabelKeys: this.selectLabelKeys(this.communicationStyleOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.communicationStyle ? 4 : '';
          },
        },
        {
          key: 'loveStyle',
          value: 'Szeretetnyelv',
          valueKey: 'profile.fields.loveStyle',
          type: 'select',
          options: this.selectValues(this.loveStyleOptions),
          values: this.selectValues(this.loveStyleOptions),
          optionLabelKeys: this.selectLabelKeys(this.loveStyleOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.loveStyle ? 4 : '';
          },
        },
        {
          key: 'currStudy',
          value: 'Jelenlegi tanulmanyom',
          valueKey: 'profile.fields.currStudy',
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum: (matchProf: UserClass) => (matchProf?.currStudy ? 3 : ''),
        },
        {
          key: 'freeTimeAct',
          value: 'Szabadidos tevekenysegeim',
          valueKey: 'profile.fields.freeTimeAct',
          type: 'checkbox',
          choices: [
            {
              key: 'football',
              value: 'Foci',
              labelKey: 'profile.values.football',
            },
            {
              key: 'handball',
              value: 'Kezilabda',
              labelKey: 'profile.values.handball',
            },
            {
              key: 'meditation',
              value: 'Meditacio',
              labelKey: 'profile.values.meditation',
            },
            {
              key: 'selfDevelopment',
              value: 'Onfejlesztes',
              labelKey: 'profile.values.selfDevelopment',
            },
            {
              key: 'reading',
              value: 'Olvasas',
              labelKey: 'profile.values.reading',
            },
            {
              key: 'training',
              value: 'Edzes',
              labelKey: 'profile.values.training',
            },
          ],
          setLaterInProf: true,
          inMatch: true,
          listNum: (matchProf: UserClass) =>
            matchProf?.freeTimeAct?.length ? 5 : '',
        },
        {
          key: 'pets',
          value: 'Kisallatok',
          valueKey: 'profile.fields.pets',
          type: 'select',
          options: this.selectValues(this.petsOptions),
          values: this.selectValues(this.petsOptions),
          optionLabelKeys: this.selectLabelKeys(this.petsOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.pets ? 5 : '';
          },
        },
        {
          key: 'drinking',
          value: 'Alkoholfogyasztas',
          valueKey: 'profile.fields.drinking',
          type: 'select',
          options: this.selectValues(this.drinkingOptions),
          values: this.selectValues(this.drinkingOptions),
          optionLabelKeys: this.selectLabelKeys(this.drinkingOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.drinking ? 5 : '';
          },
        },
        {
          key: 'smoking',
          value: 'Dohanyzas',
          valueKey: 'profile.fields.smoking',
          type: 'select',
          options: this.selectValues(this.smokingOptions),
          values: this.selectValues(this.smokingOptions),
          optionLabelKeys: this.selectLabelKeys(this.smokingOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.smoking ? 5 : '';
          },
        },
        {
          key: 'workout',
          value: 'Edzes',
          valueKey: 'profile.fields.workout',
          type: 'select',
          options: this.selectValues(this.workoutOptions),
          values: this.selectValues(this.workoutOptions),
          optionLabelKeys: this.selectLabelKeys(this.workoutOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.workout ? 5 : '';
          },
        },
        {
          key: 'socialMedia',
          value: 'Social media',
          valueKey: 'profile.fields.socialMedia',
          type: 'select',
          options: this.selectValues(this.socialMediaOptions),
          values: this.selectValues(this.socialMediaOptions),
          optionLabelKeys: this.selectLabelKeys(this.socialMediaOptions),
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.socialMedia ? 5 : '';
          },
        },
        {
          key: 'interests',
          value: 'Erdeklodesi korom',
          valueKey: 'profile.fields.interests',
          type: 'checkbox',
          choices: [
            {
              key: 'astrology',
              value: 'Asztrologia',
              labelKey: 'profile.values.astrology',
            },
            {
              key: 'painting',
              value: 'Festeszet',
              labelKey: 'profile.values.painting',
            },
            {
              key: 'art',
              value: 'Muveszet',
              labelKey: 'profile.values.art',
            },
            {
              key: 'oneNightStands',
              value: 'Egyejszakas kalandok',
              labelKey: 'profile.values.oneNightStands',
            },
            {
              key: 'makingFriends',
              value: 'Uj ismeretsegek kotese',
              labelKey: 'profile.values.makingFriends',
            },
            {
              key: 'listeningToMusic',
              value: 'Zenehallgatas',
              labelKey: 'profile.values.listeningToMusic',
            },
            {
              key: 'travel',
              value: 'Travel',
              labelKey: 'profile.values.travel',
            },
            {
              key: 'music',
              value: 'Music',
              labelKey: 'profile.values.music',
            },
            {
              key: 'dogLover',
              value: 'Dog lover',
              labelKey: 'profile.values.dogLover',
            },
            {
              key: 'coffee',
              value: 'Coffee',
              labelKey: 'profile.values.coffee',
            },
            {
              key: 'grabADrink',
              value: 'Grab a drink',
              labelKey: 'profile.values.grabADrink',
            },
            {
              key: 'foodie',
              value: 'Foodie',
              labelKey: 'profile.values.foodie',
            },
            {
              key: 'brunch',
              value: 'Brunch',
              labelKey: 'profile.values.brunch',
            },
            {
              key: 'wine',
              value: 'Wine',
              labelKey: 'profile.values.wine',
            },
            {
              key: 'hiking',
              value: 'Hiking',
              labelKey: 'profile.values.hiking',
            },
            {
              key: 'gym',
              value: 'Gym',
              labelKey: 'profile.values.gym',
            },
          ],
          setLaterInProf: true,
          inMatch: true,
        },
        {
          key: 'anthemTitle',
          value: 'Kedvenc dal',
          valueKey: 'profile.fields.anthemTitle',
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.anthemTitle ? 6 : '';
          },
        },
        {
          key: 'anthemArtist',
          value: 'Eloado',
          valueKey: 'profile.fields.anthemArtist',
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.anthemTitle ? 6 : '';
          },
        },
        {
          key: 'anthemAlbum',
          value: 'Album',
          valueKey: 'profile.fields.anthemAlbum',
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.anthemTitle ? 6 : '';
          },
        },
        {
          key: 'anthemImageUrl',
          value: 'Dal boritokep URL',
          valueKey: 'profile.fields.anthemImageUrl',
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.anthemTitle ? 6 : '';
          },
        },
        {
          key: 'anthemUrl',
          value: 'Dal link',
          valueKey: 'profile.fields.anthemUrl',
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.anthemTitle ? 6 : '';
          },
        },
      ];
    }

    if (isPromLabels) {
      this.labels.promotionLabels = [
        {
          key: 'title',
          value: 'Cim',
          valueKey: 'promotions.fields.title',
          type: 'text',
        },
        {
          key: 'description',
          value: 'Leiras',
          valueKey: 'promotions.fields.description',
          type: 'text',
        },
        {
          key: 'startDate',
          value: 'Ervenyes: ',
          valueKey: 'promotions.fields.startDate',
          type: 'text',
        },
        {
          key: 'endDate',
          value: ' -ig',
          valueKey: 'promotions.fields.endDate',
          type: 'text',
        },
        {
          key: 'category',
          value: 'Kategoria',
          valueKey: 'promotions.fields.category',
          type: 'text',
        },
        {
          key: 'price',
          value: 'Ar',
          valueKey: 'promotions.fields.price',
          type: 'number',
        },
        {
          key: 'discount',
          value: 'Learazas',
          valueKey: 'promotions.fields.discount',
          type: 'number',
        },
      ];
    }

    return this.labels;
  }

  getPromotions() {
    this.promotions = [
      new Promotions(),
      new Promotions(),
      new Promotions(),
      new Promotions(),
      new Promotions(),
    ];

    this.promotions[0] = {
      id: 'amorinoGold',
      title: 'Amorino Gold',
      titleKey: 'promotions.gold.title',
      price: 4000,
      discount: 50,
      offerLine: '50% off for 3 months',
      offerKey: 'promotions.gold.offer',
      category: 'Subscription',
      categoryKey: 'promotions.category.subscription',
      eyebrowKey: 'promotions.gold.eyebrow',
      iconName: 'diamond-outline',
      accent: '#ff5d8f',
      accentSoft: '#f2c76e',
      isFeatured: true,
      description:
        'See who likes you, boost your profile and get more matches.',
      descriptionKey: 'promotions.gold.description',
      ctaKey: 'promotions.gold.cta',
    };

    this.promotions[1] = {
      id: 'profileBoost',
      title: 'Profile Boost',
      titleKey: 'promotions.profileBoost.title',
      price: 1000,
      category: 'Boost',
      categoryKey: 'promotions.category.boost',
      eyebrowKey: 'promotions.profileBoost.eyebrow',
      offerLine: 'Get more views today',
      offerKey: 'promotions.profileBoost.offer',
      iconName: 'rocket-outline',
      accent: '#35c6bd',
      accentSoft: '#4c8dff',
      description:
        'Be shown to more people near you and increase your chances of matching.',
      descriptionKey: 'promotions.profileBoost.description',
      ctaKey: 'promotions.profileBoost.cta',
    };

    this.promotions[2] = {
      id: 'seeLikes',
      title: 'See Who Likes You',
      titleKey: 'promotions.seeLikes.title',
      price: 1500,
      category: 'Premium',
      categoryKey: 'promotions.category.premium',
      eyebrowKey: 'promotions.seeLikes.eyebrow',
      offerLine: 'Reveal your hidden likes',
      offerKey: 'promotions.seeLikes.offer',
      iconName: 'eye-outline',
      accent: '#ff7a59',
      accentSoft: '#ff5d8f',
      description: 'Find out who already liked your profile and match faster.',
      descriptionKey: 'promotions.seeLikes.description',
      ctaKey: 'promotions.seeLikes.cta',
    };

    this.promotions[3] = {
      id: 'superLike',
      title: 'Super Like Pack',
      titleKey: 'promotions.superLike.title',
      price: 1200,
      category: 'Super Like',
      categoryKey: 'promotions.category.superLike',
      eyebrowKey: 'promotions.superLike.eyebrow',
      offerLine: '5 Super Likes included',
      offerKey: 'promotions.superLike.offer',
      iconName: 'heart-circle-outline',
      accent: '#a855f7',
      accentSoft: '#ff5d8f',
      description: 'Send stronger signals to people you really like.',
      descriptionKey: 'promotions.superLike.description',
      ctaKey: 'promotions.superLike.cta',
    };

    this.promotions[4] = {
      id: 'firstMonth',
      title: 'First Month Premium',
      titleKey: 'promotions.firstMonth.title',
      price: 99,
      category: 'Premium',
      categoryKey: 'promotions.category.premium',
      eyebrowKey: 'promotions.firstMonth.eyebrow',
      offerLine: 'First month for £0.99',
      offerKey: 'promotions.firstMonth.offer',
      iconName: 'gift-outline',
      accent: '#f2c76e',
      accentSoft: '#ff7a59',
      description:
        'Try premium discovery with more visibility and better matching tools.',
      descriptionKey: 'promotions.firstMonth.description',
      ctaKey: 'promotions.firstMonth.cta',
    };

    return this.promotions;
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;

    if (!input.files) {
      this.selectedFiles.set([]);
      return;
    }

    this.selectedFiles.set(Array.from(input.files));
  }

  getListNum(matchProf: UserClass, labelName: string) {
    return matchProf[labelName] ? 3 : '';
  }
}
