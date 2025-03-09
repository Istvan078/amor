import { Component } from '@angular/core';
import { AuthService } from '../services/auth.service';

type registrationData = {
  data: {};
  labels: string[];
};

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page {
  registrationData!: registrationData;
  labels: string[] = [
    'Email',
    'Jelszo',
    'Keresztnev',
    'Vezeteknev',
    'Szuletesi Datum',
    'Kor',
  ];
  constructor(private auth: AuthService) {
    this.registerUser();
  }
  registerUser() {
    this.registrationData = {
      data: {
        email: '',
        password: '',
        firstName: 'Istvan',
        lastName: 'Kalmar',
        birthDate: '1992-10-30',
        age: 32,
      },
      labels: this.labels,
    };
  }
  getSubmittedData(data: any) {
    this.auth.registerEmail(data);
    console.log(data); // ELMENTENI ADATBAZISBA
  }
}
