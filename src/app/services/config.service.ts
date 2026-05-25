import { Injectable, signal } from '@angular/core';

import { Promotions } from '../shared/models/promotions.model';
import { UserClass } from '../shared/models/user.model';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  labels: any = {};
  promotions: Promotions[] = [];

  readonly selectedFiles = signal<File[]>([]);
  readonly mainViewInitVersion = signal(0);

  requestMainViewInit() {
    this.mainViewInitVersion.update((version) => version + 1);
  }

  clearSelectedFiles() {
    this.selectedFiles.set([]);
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
          value: 'Milyen tarsat keresel?',
          valueKey: 'profile.fields.lookingForType',
          type: 'text-area',
          placeholder: 'Milyen tipusu embert keresel?',
          placeholderKey: 'profile.placeholders.lookingForType',
          setLaterInProf: true,
          inMatch: true,
          listNum: 1,
        },
        {
          key: 'lookingForGender',
          value: 'Kit keresel?',
          valueKey: 'profile.fields.lookingForGender',
          type: 'select',
          options: ['Ferfi', 'No', 'Egyeb'],
          values: ['Ferfi', 'No', 'Egyeb'],
          optionLabelKeys: [
            'profile.values.man',
            'profile.values.woman',
            'profile.values.other',
          ],
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
          options: ['Ferfi', 'No', 'Egyeb'],
          values: ['Ferfi', 'No', 'Egyeb'],
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
          type: 'text',
          setLaterInProf: true,
          inMatch: true,
          listNum(matchProf: UserClass) {
            return matchProf?.zodiacSign ? 4 : '';
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
          ],
          setLaterInProf: true,
          inMatch: true,
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
