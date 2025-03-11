import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  labels: any = {};
  constructor() {}
  getLabels(isUserProfL?: boolean) {
    if (isUserProfL)
      this.labels.userProfLabels = [
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
      ];
    return this.labels;
  }
  // { key: 'email', value: 'Email', type: 'email' },
  // { key: 'password', value: 'Jelszo', type: 'password' },
}
