import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';
import { ConfigService } from '../services/config.service';
import { UserClass } from '../models/user.model';

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
  constructor(
    private auth: AuthService,
    private base: BaseService,
    private config: ConfigService
  ) {}
  ngOnInit(): void {
    this.registerUser();
    console.log(this.registrationData);
  }
  registerUser() {
    this.registrationData = {
      data: new UserClass(),
      labels: this.config.getLabels(true),
    };
  }
  async getSubmittedData(data: any) {
    const userCreds = await this.auth.registerEmail(data);
    // await this.base.registerUserProf(userCreds.user!.uid, data);
    console.log(data); // ELMENTENI ADATBAZISBA
  }
}
