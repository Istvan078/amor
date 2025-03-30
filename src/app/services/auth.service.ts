import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { FirebaseUser } from '../models/user.model';
import { environment } from 'src/environments/environment.prod';
import { BaseService } from './base.service';

@Injectable({
 providedIn: 'root',
})
export class AuthService {
 usersApiUrl = environment.API_URL;
 loggedUser: any;
 loggedUserSubject: BehaviorSubject<any> = new BehaviorSubject(null);
 usersSubject: BehaviorSubject<any> = new BehaviorSubject([]);
 userClaimsSubj: BehaviorSubject<{}> = new BehaviorSubject({});
 authAutoFillSubj: BehaviorSubject<any> = new BehaviorSubject(null);
 httpHeaders: HttpHeaders = new HttpHeaders();
 customClaims?: {
  gender: 'No' | 'Ferfi' | 'Egyeb';
  lookingForGender: 'No' | 'Ferfi';
  lookingForDistance: number;
  currentPlace: string;
  currentLocCoords: { lat: number; lon: number };
  lookingForAge: { lower: number; upper: number };
 };
 userProfCreatedSubjSub: Subscription = Subscription.EMPTY;
 constructor(
  private afAuth: AngularFireAuth,
  private http: HttpClient,
  private base: BaseService
 ) {
  this.getLoggedInUser();
 }
 getLoggedInUser() {
  this.afAuth.authState.subscribe(async (usr) => {
   this.loggedUser = usr;
   if (usr) {
    await this.setAuthHeaderAndIdToken(usr);
    // this.loggedUserSubject.next(this.loggedUser);
   }
   this.userProfCreatedSubjSub = this.base.userProfCreatedSubject.subscribe(
    (userProfCreated) => {
     if (this.loggedUser && !userProfCreated) {
      this.getUsers().subscribe((users: any) => {
       this.usersSubject.next(users);
      });
      this.getClaims().subscribe((claims: any) => {
       this.loggedUser.claims = claims;
       this.userClaimsSubj.next(claims);
       this.loggedUserSubject.next(this.loggedUser);
       if (this.loggedUser.claims && !userProfCreated) {
        console.log(`A felhasznalonak mar van claims-je!`);
        this.userProfCreatedSubjSub.unsubscribe();
       }
      });
     }
     if (userProfCreated) {
      this.loggedUserSubject.next(this.loggedUser);
      this.userProfCreatedSubjSub.unsubscribe();
     }
    }
   );
   if (!usr) {
    this.loggedUserSubject.next(null)
    if(this.userProfCreatedSubjSub)this.userProfCreatedSubjSub.unsubscribe()
  };
  });
 }
 async registerEmail(data: any) {
  const userCreds = await this.afAuth.createUserWithEmailAndPassword(
   data.email,
   data.password
  );
  return userCreds;
 }
 async signInWithEmail(data: any) {
  const userCreds = await this.afAuth.signInWithEmailAndPassword(
   data.email,
   data.password
  );
  return userCreds;
 }

 async signOut() {
  await this.afAuth.signOut();
 }

 async setAuthHeaderAndIdToken(user: FirebaseUser) {
  const idToken = await user?.getIdToken();
  this.loggedUser.idToken = idToken;
  this.httpHeaders = this.httpHeaders.set(
   'Authorization',
   this.loggedUser.idToken
  );
 }

 //  getIdToken(user: any) {
 //   user?.getIdToken().then((idToken: string) => {
 //    this.loggedUser.idToken = idToken;
 //    this.httpHeaders = this.httpHeaders.set(
 //     'Authorization',
 //     this.loggedUser.idToken
 //    );
 //    this.getClaims().subscribe((claims: any) => {
 //     if (claims) {
 //      this.loggedUser.claims = claims;
 //      this.userClaimsSubj.next(claims);
 //      this.getUsers().subscribe((users: any) => {
 //       this.usersSubject.next(users);
 //      });
 //     } else {
 //      if (this.loggedUser.uid) {
 //       this.setCustomClaims(this.loggedUser.uid, this.customClaims);
 //       this.loggedUserSubject.next(this.loggedUser);
 //      }
 //     }
 //    });
 //   });
 //  }

 getClaims() {
  return this.http.get(
   this.usersApiUrl + `users/${this.loggedUser.uid}/claims`,
   {
    headers: this.httpHeaders,
   }
  );
 }

 getUsers(): Observable<FirebaseUser[]> {
  if (this.loggedUser.idToken) {
   // let headers = new HttpHeaders().set('Authorization', this.user.idToken);
   return this.http.get<FirebaseUser[]>(this.usersApiUrl + 'users', {
    headers: this.httpHeaders,
   });
  }
  return of([]);
 }
 setCustomClaims(uid: string, claims: any) {
  const body = { uid, claims };
  this.http
   .post(this.usersApiUrl + 'setCustomClaims', body, {
    headers: this.httpHeaders,
   })
   .subscribe({
    next: () => console.log('A claims beállítása sikeres!'),
   });
 }
}
