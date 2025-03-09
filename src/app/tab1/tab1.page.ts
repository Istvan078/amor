import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';

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
export class Tab1Page implements OnInit {
  registrationData!: registrationData;
  labels: string[] = [
    'Email',
    'Jelszo',
    'Keresztnev',
    'Vezeteknev',
    'Szuletesi Datum',
    'Kor',
  ];
  constructor(private auth: AuthService, private base: BaseService) {}
  ngOnInit(): void {
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
  async getSubmittedData(data: any) {
    const userCreds = await this.auth.registerEmail(data);
    await this.base.registerUserProf(userCreds.user!.uid, data);
    console.log(data); // ELMENTENI ADATBAZISBA
  }
}
