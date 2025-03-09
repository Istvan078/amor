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
        { key: 'email', value: 'Email' },
        { key: 'password', value: 'Jelszo' },
        { key: 'firstName', value: 'Keresztnev' },
        { key: 'lastName', value: 'Vezeteknev' },
        { key: 'birthDate', value: 'Szuletesi Datum' },
        { key: 'age', value: 'Kor' },
      ];
    return this.labels;
  }
}
