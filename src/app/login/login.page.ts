import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { BaseService } from '../services/base.service';

@Component({
 selector: 'app-login',
 templateUrl: 'login.page.html',
 styleUrls: ['login.page.scss'],
 standalone: false,
})
export class LoginPage implements OnInit {
 loginData: any;
 labels: string[] = ['Email', 'Jelszo'];
 constructor(
  private auth: AuthService,
  private router: Router,
  private base: BaseService
 ) {}
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
  this.auth.authAutoFillSubj.subscribe(
   (em) => (this.loginData.data.email = em)
  );
 }
 async loginUser() {
  this.base.userProfCreatedSubject.next(false);
  await this.auth.signInWithEmail(this.loginData.data);
  this.router.navigate(['/amor/tab3']);
 }
 getSubmittedData(loginData: any) {
  console.log(loginData);
 }
}
