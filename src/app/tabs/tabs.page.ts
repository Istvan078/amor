import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';
import { Router } from '@angular/router';
import { UserClass } from '../models/user.model';
import { Subscription } from 'rxjs';

@Component({
 selector: 'app-tabs',
 templateUrl: 'tabs.page.html',
 styleUrls: ['tabs.page.scss'],
 standalone: false,
})
export class TabsPage implements OnInit {
 loggedUser: any;
 userProf?: UserClass;
 loggedUserSubjSub: Subscription = Subscription.EMPTY;
 constructor(
  private auth: AuthService,
  private base: BaseService,
  private router: Router
 ) {}
 async ngOnInit() {
  this.loggedUserSubjSub = this.auth.loggedUserSubject.subscribe(
   async (usr) => {
    if (!usr) {
     this.userProf = undefined;
     this.loggedUser = undefined;
    }
    if (usr) this.loggedUser = usr;
    if (this.loggedUser?.uid) {
     this.userProf = (await this.base.getUserProf(this.loggedUser.uid)) as any;
     console.log(this.userProf);

     if (this.userProf) {
      Object.setPrototypeOf(this.userProf, UserClass.prototype);
      this.userProf?.calcAge();
      this.base.userProfBehSubj.next(this.userProf);
      this.auth.customClaims = {
       gender: this.userProf.gender!,
       lookingForGender: this.userProf.lookingForGender as any,
       lookingForDistance: this.userProf.lookingForDistance as number,
       lookingForAge: this.userProf.lookingForAge,
      };
      if (this.loggedUser?.claims) this.router.navigate(['/amor/tab3']);
      if (!this.loggedUser?.claims) {
       this.auth.setCustomClaims(this.loggedUser.uid, this.auth.customClaims);
       this.loggedUser.claims = this.auth.customClaims;
       this.auth.loggedUserSubject.next(this.loggedUser);
       this.auth.getUsers().subscribe((users: any) => {
        //    this.auth.usersSubject.next(users);
        this.router.navigate(['/amor/tab3']);
        console.log(users);
       });
      }
     }
    }
   }
  );
 }
 openUserCard() {
  this.base.isUserCardOpenSubj.next(true);
 }
 showMatchesCard() {
  this.base.isUserCardOpenSubj.next(false);
 }
 ngOnDestroy() {
  if (this.loggedUserSubjSub) this.loggedUserSubjSub.unsubscribe();
  console.log('ngOnDestroy: Az oldal megsemmisült');
 }
}
