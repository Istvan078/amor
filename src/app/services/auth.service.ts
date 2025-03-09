import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(private afAuth: AngularFireAuth) {
    this.getLoggedInUser();
  }
  getLoggedInUser() {
    this.afAuth.authState.subscribe((usr) => {
      console.log(usr);
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
}
