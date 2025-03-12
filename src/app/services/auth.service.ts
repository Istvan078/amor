import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  loggedUser: any;
  loggedUserSubject: Subject<any> = new Subject();
  constructor(private afAuth: AngularFireAuth) {
    this.getLoggedInUser();
  }
  getLoggedInUser() {
    this.afAuth.authState.subscribe((usr) => {
      this.loggedUser = usr;
      this.loggedUserSubject.next(usr);
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
}
