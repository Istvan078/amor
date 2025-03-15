import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';
import { Router } from '@angular/router';
import { UserClass } from '../models/user.model';

@Component({
 selector: 'app-tabs',
 templateUrl: 'tabs.page.html',
 styleUrls: ['tabs.page.scss'],
 standalone: false,
})
export class TabsPage implements OnInit {
 loggedUser: any;
 userProf?: UserClass;
 constructor(
  private auth: AuthService,
  private base: BaseService,
  private router: Router
 ) {}
 async ngOnInit() {
  console.log(this.userProf);
  this.auth.loggedUserSubject.subscribe(async (usr) => {
   this.loggedUser = usr;
   if (this.loggedUser?.uid) {
    this.userProf = (await this.base.getUserProf(this.loggedUser.uid)) as any;
    if (this.userProf) {
     Object.setPrototypeOf(this.userProf, UserClass.prototype);
     this.userProf?.calcAge();
     this.base.userProfBehSubj.next(this.userProf);
     this.router.navigate(['/amor/tab3']);
    }
   }
  });
 }
 openUserCard() {
  this.base.isUserCardOpenSubj.next(true);
 }
 showMatchesCard() {
  this.base.isUserCardOpenSubj.next(false);
 }
}
