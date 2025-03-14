import { Injectable } from '@angular/core';
import { Promotions } from '../models/promotions.model';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  labels: any = {};
  promotions: Promotions[] = [];
  constructor() {}
  getLabels(isUserProfL?: boolean, isPromLabels?: boolean) {
    if (isUserProfL)
      this.labels.userProfLabels = [
        {
          key: 'aboutMe',
          value: 'Rolam',
          type: 'text-area',
          placeholder: 'Meselj magadrol',
          setLaterInProf: true,
        },
        {
          key: 'lookingForType',
          value: 'Kit keresek?',
          type: 'text-area',
          placeholder: 'Milyen tipusu embert keresel?',
          setLaterInProf: true,
        },
        {
          key: 'lookingFor',
          value: 'Kit keresel?',
          type: 'select',
          options: ['Ferfi', 'No'],
          values: ['man', 'woman'],
        },
        {
          key: 'gender',
          value: 'Nemed',
          type: 'select',
          options: ['Ferfi', 'No', 'Egyeb'],
          values: ['man', 'woman', 'other'],
        },
        { key: 'firstName', value: 'Keresztneved', type: 'text' },
        { key: 'lastName', value: 'Vezetekneved', type: 'text' },
        { key: 'userName', value: 'Felhasznalonev', type: 'text' },
        { key: 'birthDate', value: 'Szuletesi Datum', type: 'date' },
        { key: 'currentPlace', value: 'Jelenlegi helyed', type: 'text' },
        {
          key: 'lookingForDistance',
          value: 'Milyen tavol legyen? (Max Km)',
          type: 'number',
        },
        { key: 'age', value: 'Kor', setByApp: true },
        { key: 'job', value: 'Munkahely', type: 'text', setLaterInProf: true },
        {
          key: 'highestSchool',
          value: 'Legmagasabb iskolai vegzettseg',
          type: 'text',
          setLaterInProf: true,
        },
        {
          key: 'zodiacSign',
          value: 'Csillagjegy',
          type: 'text',
          setLaterInProf: true,
        },
        {
          key: 'currStudy',
          value: 'Jelenlegi tanulmanyom',
          type: 'text',
          setLaterInProf: true,
        },
        {
          key: 'freeTimeAct',
          value: 'Szabadidos tevekenysegeim',
          type: 'checkbox',
          choices: [
            { key: 'football', value: 'Foci' },
            { key: 'handball', value: 'Kezilabda' },
            { key: 'meditation', value: 'Meditacio' },
            { key: 'selfDevelopment', value: 'Onfejlesztes' },
            { key: 'reading', value: 'Olvasas' },
            { key: 'training', value: 'Edzes' },
          ],
          setLaterInProf: true,
        },
        {
          key: 'interests',
          value: 'Erdeklodesi korom',
          type: 'checkbox',
          choices: [
            { key: 'astrology', value: 'Asztrologia' },
            { key: 'painting', value: 'Festeszet' },
            { key: 'art', value: 'Muveszet' },
            { key: 'oneNightStands', value: 'Egyejszakas kalandok' },
            { key: 'makingFriends', value: 'Uj ismeretsegek kotese' },
            { key: 'listeningToMusic', value: 'Zenehallgatas' },
          ],
          setLaterInProf: true,
        },
      ];
    if (isPromLabels)
      this.labels.promotionLabels = [
        {
          key: 'title',
          value: 'Cim',
          type: 'text',
        },
        {
          key: 'description',
          value: 'Leiras',
          type: 'text',
        },
        {
          key: 'startDate',
          value: 'Ervenyes: ',
          type: 'text',
        },
        { key: 'endDate', value: ' -ig', type: 'text' },
        { key: 'category', value: 'Kategoria', type: 'text' },
        { key: 'price', value: 'Ar', type: 'number' },
        { key: 'discount', value: 'Learazas', type: 'number' },
      ];
    return this.labels;
  }

  getPromotions() {
    this.promotions = [new Promotions(), new Promotions()];
    this.promotions[0] = {
      title: 'Amorino Gold',
      price: 4000,
      discount: 50,
      category: 'Előfizetés',
      isFeatured: true,
      description: '3 honapig 50%-os aron megveheted az Amorino Gold csomagot',
    };
    this.promotions[1] = {
      title: 'Kiemeles',
      price: 1000,
      discount: 70,
      category: 'Előfizetés',
      isFeatured: false,
      description: '1 honapig 70% kedvezmeny minden kiemelesre',
    };
    return this.promotions;
  }
  // { key: 'email', value: 'Email', type: 'email' },
  // { key: 'password', value: 'Jelszo', type: 'password' },
}
