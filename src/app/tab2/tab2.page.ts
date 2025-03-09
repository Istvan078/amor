import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page implements OnInit {
  loginData: any;
  labels: string[] = ['Email', 'Jelszo'];
  constructor(private auth: AuthService) {}
  ngOnInit(): void {
    this.loginUser();
  }

  loginUser() {
    this.loginData = {
      data: {
        email: '',
        password: '',
      },
      labels: this.labels,
    };
  }
  getSubmittedData(loginData: any) {
    console.log(loginData);
  }
}
