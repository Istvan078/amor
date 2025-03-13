import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page implements OnInit {
  loginData: any;
  labels: string[] = ['Email', 'Jelszo'];
  constructor(private auth: AuthService, private router: Router) {}
  ngOnInit(): void {
    this.setLoginData();
  }

  setLoginData() {
    this.loginData = {
      data: {
        email: '',
        password: '',
      },
      labels: this.labels,
    };
    this.auth.authAutoFillSubj.subscribe(em => this.loginData.data.email = em)
  }
  async loginUser() {
    await this.auth.signInWithEmail(this.loginData.data);
    this.router.navigate(['/tabs/tab3']);
  }
  getSubmittedData(loginData: any) {
    console.log(loginData);
  }
}
