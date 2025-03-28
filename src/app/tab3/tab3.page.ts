import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';
import { Observable } from 'rxjs';
import { ConfigService } from '../services/config.service';
import { MatchParts, UserClass } from '../models/user.model';
import { Geolocation } from '@capacitor/geolocation';
import { LocationService } from '../services/location.service';

@Component({
 selector: 'app-tab3',
 templateUrl: 'tab3.page.html',
 styleUrls: ['tab3.page.scss'],
 standalone: false,
})
export class Tab3Page implements OnInit {
 loggedUser: any;
 userProf?: UserClass;
 matchUserProfs: any[] = [];
 matches: any[] = [];
 users: any[] = [];
 progress: number = 0;
 buffer: number = 0;

 constructor(
  private auth: AuthService,
  private base: BaseService,
  private config: ConfigService,
  private locationService: LocationService
 ) {}

 async ngOnInit() {
  console.log(`***TAB3 INIT***`);
  this.auth.loggedUserSubject.subscribe(async (usr) => {
   if (usr) this.loggedUser = usr;
   if (!usr) this.loggedUser = undefined;
  });
  this.base.userProfBehSubj.subscribe((uProf) => {
   this.userProf = uProf;
   if (this.userProf && !this.userProf?.matchParts)
    this.userProf.matchParts = new MatchParts();
  });
  this.auth.usersSubject.subscribe(async (users) => {
   const obs = new Observable((observer) => {
    const int = setInterval(() => {
     if (this.loggedUser?.claims && this.userProf) {
      observer.next(users);
      clearInterval(int);
     }
    }, 200);
   }).subscribe(async (users: any) => {
    if (users?.length) {
     this.setProgressBuffer();
     let possibleMatches: any[] = [];
     let helperArr: any[] = [];
     let matchHelperNum: number = 0;
     let hasPossMatches: boolean = true;
     const error = new Error();
     const userProfLocation = await this.locationService.getLocation();
     let userProfLocDetails: any = await this.locationService.getLocName(
      userProfLocation
     );
     if (userProfLocDetails?.error)
      userProfLocDetails = await this.locationService.getLocName(
       userProfLocation,
       true
      );
     this.progress = 25;
     const currCity = userProfLocDetails?.city
      ? userProfLocDetails.city
      : userProfLocDetails.address.city;
     if (currCity !== this.userProf?.currentPlace) {
      this.loggedUser.claims.currentPlace = currCity;
      this.auth.setCustomClaims(this.userProf?.uid!, this.loggedUser.claims);
     }

     if (!this.userProf?.matchParts?.possMatches?.length) {
      hasPossMatches = false;
     }
     this.userProf?.matchParts?.liked?.map(async (uid) => {
      const likedUProf: any = await this.base.getUserProf(uid);
      if (likedUProf)
       if (
        likedUProf?.matchParts?.liked?.includes(this.userProf?.uid) &&
        !this.userProf?.matchParts?.matches?.includes(uid)
       ) {
        this.userProf?.matchParts?.matches.push(uid);
        this.userProf!.matchParts!.liked =
         this.userProf?.matchParts?.liked.filter((uId) => uId !== uid)!;
        likedUProf!.matchParts!.liked = likedUProf?.matchParts?.liked.filter(
         (uId: any) => uId !== uid
        )!;
        likedUProf?.matchParts?.matches.push(this.userProf?.uid);
        await this.base.updateUserProf(uid, likedUProf);
        await this.base.updateUserProf(
         this.userProf?.uid!,
         this.userProf?.setDataForFireStore()
        );
       }
     });

     setTimeout(() => {
      // MEGCSINÁLNI
      this.matches = []
      this.userProf?.matchParts?.matches?.map(async (uid) => {
        const matchProf = await this.base.getUserProf(uid);
        this.matches.push(matchProf);
      });
      console.log("Timeout lefutott", this.matches);
     }, 2000);
     if (
      !this.userProf?.matchParts?.possMatches?.length ||
      currCity !== this.userProf?.currentPlace
     )
      possibleMatches = await new Promise(async (res, rej) => {
       this.userProf!.matchParts!.possMatches = [];
       this.progress = 0;
       const possMatchesArr = users.filter(
        (user: any) =>
         user?.claims?.gender === this.loggedUser?.claims?.lookingForGender &&
         user.claims.currentPlace &&
         !this.userProf?.matchParts?.liked?.includes(user.uid) &&
         !this.userProf?.matchParts?.notLiked?.includes(user.uid) &&
         !this.userProf?.matchParts?.matches?.includes(user.uid)
       );
       if (!possMatchesArr?.length) {
        res(possMatchesArr);
        this.progress = 100;
       }
       for (let usr of possMatchesArr) {
        let matchLocation = await this.locationService.getCoordsGeocodeXYZ(
         usr.claims.currentPlace
        );
        if (matchLocation.message) {
         if (!error.message) {
          error.message = matchLocation.message;
          console.log(error.message);
         }
         matchLocation = await this.locationService.getCoordinatesOSM(
          usr.claims.currentPlace
         );
        }
        await this.locationService.delay(1000);
        const distBetweenMeAndMatch =
         this.locationService.getDistanceBetweenPoints(
          userProfLocation.coords.latitude,
          userProfLocation.coords.longitude,
          matchLocation.lat,
          matchLocation.lon
         );
        helperArr.push(usr.uid);
        if (
         distBetweenMeAndMatch <= +this.loggedUser.claims.lookingForDistance
        ) {
         possibleMatches.push(usr.uid);
         this.userProf!.matchParts?.possMatches!.push(usr.uid);
        }
        this.progress = helperArr.length / possMatchesArr.length;
        if (helperArr.length === possMatchesArr.length) {
         this.userProf!.currentPlace = currCity;
         await this.base.updateUserProf(
          this.userProf!.uid!,
          this.userProf?.setDataForFireStore()
         );
         this.progress = 100;
         //  if(!this.userProf?.matchParts?.possMatches.length) this.
         res(possibleMatches);
        }
        if (!possMatchesArr?.length) res([]);
       }
      });
     if (!hasPossMatches) {
      this.base.updateUserProf(
       this.userProf!.uid!,
       this.userProf?.setDataForFireStore()
      );
     }
     if (hasPossMatches) this.progress = 70;
     this.matchUserProfs = this.shuffleArray(
      this.userProf!.matchParts?.possMatches!
     );
     this.config.initMainViewSubject.next(true);
     this.users = users;
     this.progress = 100;
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
 setProgressBuffer() {
  const int = setInterval(() => {
   this.buffer = this.buffer + 0.35;
   if (this.progress > 25) clearInterval(int);
  }, 200);
 }
 ionViewWillEnter() {
  console.log(`ionViewWillEnter TAB3***`);
 }
}
