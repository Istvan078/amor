import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Auth,
  User,
  authState,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from '@angular/fire/auth';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { environment } from 'src/environments/environment';

type LoginData = {
  email: string;
  password: string;
};

type CustomClaims = {
  gender: 'No' | 'Ferfi' | 'Egyeb';
  lookingForGender: 'No' | 'Ferfi';
  lookingForDistance: number;
  currentPlace: string;
  currentLocCoords: {
    lat: number;
    lon: number;
  };
  lookingForAge: {
    lower: number;
    upper: number;
  };
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private http = inject(HttpClient);

  usersApiUrl = environment.API_URL;

  loggedUser: any = null;
  loggedUserSubject = new BehaviorSubject<any>(null);
  usersSubject = new BehaviorSubject<any[]>([]);
  userClaimsSubj = new BehaviorSubject<Partial<CustomClaims>>({});
  authAutoFillSubj = new BehaviorSubject<string | null>(null);

  httpHeaders = new HttpHeaders();

  customClaims?: CustomClaims;

  private authListenerStarted = false;

  constructor() {
    this.getLoggedInUser();
  }

  getLoggedInUser() {
    if (this.authListenerStarted) {
      return;
    }

    this.authListenerStarted = true;

    authState(this.auth).subscribe(async (user) => {
      if (!user) {
        this.loggedUser = null;
        this.httpHeaders = new HttpHeaders();
        this.loggedUserSubject.next(null);
        this.usersSubject.next([]);
        this.userClaimsSubj.next({});
        return;
      }

      this.loggedUser = await this.createLoggedUserData(user);
      this.loggedUserSubject.next(this.loggedUser);

      this.loadClaimsForLoggedUser();
      this.loadUsers();
    });
  }

  async registerEmail(data: LoginData) {
    const userCredentials = await createUserWithEmailAndPassword(
      this.auth,
      data.email,
      data.password
    );

    this.loggedUser = await this.createLoggedUserData(userCredentials.user);
    this.loggedUserSubject.next(this.loggedUser);

    return userCredentials;
  }

  async signInWithEmail(data: LoginData) {
    const userCredentials = await signInWithEmailAndPassword(
      this.auth,
      data.email,
      data.password
    );

    this.loggedUser = await this.createLoggedUserData(userCredentials.user);
    this.loggedUserSubject.next(this.loggedUser);

    this.loadClaimsForLoggedUser();
    this.loadUsers();

    return userCredentials;
  }

  async signOut() {
    await signOut(this.auth);

    this.loggedUser = null;
    this.httpHeaders = new HttpHeaders();

    this.loggedUserSubject.next(null);
    this.usersSubject.next([]);
    this.userClaimsSubj.next({});
  }

  async setAuthHeaderAndIdToken(user: User) {
    const idToken = await user.getIdToken();

    if (!this.loggedUser) {
      this.loggedUser = {};
    }

    this.loggedUser.idToken = idToken;
    this.httpHeaders = new HttpHeaders().set('Authorization', idToken);
  }

  getClaims(): Observable<any> {
    if (!this.loggedUser?.uid || !this.loggedUser?.idToken) {
      return of(null);
    }

    return this.http.get(
      this.usersApiUrl + `users/${this.loggedUser.uid}/claims`,
      {
        headers: this.httpHeaders,
      }
    );
  }

  getUsers(): Observable<any[]> {
    if (!this.loggedUser?.idToken) {
      return of([]);
    }

    return this.http.get<any[]>(this.usersApiUrl + 'users', {
      headers: this.httpHeaders,
    });
  }

  setCustomClaims(uid: string, claims: CustomClaims | any) {
    if (!this.loggedUser?.idToken) {
      return;
    }

    const body = {
      uid,
      claims,
    };

    this.http
      .post(this.usersApiUrl + 'setCustomClaims', body, {
        headers: this.httpHeaders,
      })
      .subscribe({
        next: () => {
          this.customClaims = claims;
          this.loggedUser = {
            ...this.loggedUser,
            claims,
          };

          this.userClaimsSubj.next(claims);
          this.loggedUserSubject.next(this.loggedUser);

          console.log('Custom claims updated successfully.');
        },
        error: (error) => {
          console.error('Custom claims update failed:', error);
        },
      });
  }

  private async createLoggedUserData(user: User) {
    const idToken = await user.getIdToken();

    this.httpHeaders = new HttpHeaders().set('Authorization', idToken);

    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
      idToken,
      claims: null,
      raw: user,
    };
  }

  private loadClaimsForLoggedUser() {
    this.getClaims().subscribe({
      next: (claims) => {
        if (!claims) {
          this.loggedUserSubject.next(this.loggedUser);
          return;
        }

        this.loggedUser = {
          ...this.loggedUser,
          claims,
        };

        this.userClaimsSubj.next(claims);
        this.loggedUserSubject.next(this.loggedUser);
      },
      error: (error) => {
        console.error('Claims loading failed:', error);
        this.loggedUserSubject.next(this.loggedUser);
      },
    });
  }

  private loadUsers() {
    this.getUsers().subscribe({
      next: (users) => {
        this.usersSubject.next(users ?? []);
      },
      error: (error) => {
        console.error('Users loading failed:', error);
        this.usersSubject.next([]);
      },
    });
  }
}