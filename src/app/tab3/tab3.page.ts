import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';
import { Observable } from 'rxjs';
import { ConfigService } from '../services/config.service';

@Component({
 selector: 'app-tab3',
 templateUrl: 'tab3.page.html',
 styleUrls: ['tab3.page.scss'],
 standalone: false,
})
export class Tab3Page implements OnInit {
 loggedUser: any;
 userProf: any;
 matchUserProfs: any[] = [];
 users: any[] = [];

 constructor(
  private auth: AuthService,
  private base: BaseService,
  private config: ConfigService
 ) {}

 async ngOnInit() {
  console.log(`***TAB3 INIT***`);
  this.auth.loggedUserSubject.subscribe(async (usr) => {
   if (usr) this.loggedUser = usr;
   if (!usr) this.loggedUser = undefined;
  });
  this.auth.usersSubject.subscribe(async (users) => {
   const obs = new Observable((observer) => {
    const int = setInterval(() => {
     if (this.loggedUser?.claims) {
      observer.next(users);
      clearInterval(int);
     }
    }, 200);
   }).subscribe((users: any) => {
    if (users?.length) {
     let possibleMatches: any[] = [];
     users.map((user: any) => {
      if (user?.claims?.gender === this.loggedUser?.claims?.lookingForGender) {
       possibleMatches.push(user.uid);
      }
     });
     this.matchUserProfs = this.shuffleArray(possibleMatches);
     console.log(this.matchUserProfs.length + ' találat');
     this.config.initMainViewSubject.next(true);
     this.users = users;
     obs.unsubscribe();
    }
   });
  });
 }
 shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]; // Másolat, hogy ne módosítsa az eredetit
  for (let i = shuffled.length - 1; i > 0; i--) {
   const j = Math.floor(Math.random() * (i + 1)); // Véletlen index
   [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Cseréljük az elemeket
  }
  return shuffled;
 }
 ionViewWillEnter() {
  console.log(`ionViewWillEnter TAB3***`);
 }
}
