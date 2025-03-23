import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { BehaviorSubject } from 'rxjs';

@Injectable({
 providedIn: 'root',
})
export class BaseService {
 userProfBehSubj: BehaviorSubject<any> = new BehaviorSubject(null);
 isUserCardOpenSubj: BehaviorSubject<any> = new BehaviorSubject(false);
 userProfCreatedSubject: BehaviorSubject<boolean> = new BehaviorSubject(false);
 constructor(private fireStore: AngularFirestore) {
  this.getAllUserProfs();
 }

 async getUserProf(uid: string) {
  const document = await this.fireStore.firestore
   .doc(`users/${uid}`)
   .get({ source: 'server' });
  return document.data();
 }

 async getAllUserProfs() {
  const copiedUsers: any[] = [];
  const users = (await this.fireStore.firestore.collection('users').get()).docs;
  users.map((user) => copiedUsers.push(user.data()));
  return copiedUsers;
 }

 async registerUserProf(uid: string, data: any) {
  try {
   const userRef = this.fireStore.firestore.collection('users').doc(uid);
   await userRef.set(data); // 🔥 Felülírja vagy létrehozza a dokumentumot
   console.log('✅ Felhasználói adatok sikeresen elmentve Firestore-ba!');
  } catch (error) {
   console.error('❌ Hiba történt a Firestore mentés során:', error);
  }
 }
 async updateUserProf(uid: string, data: any) {
  try {
   await this.fireStore.firestore.doc(`users/${uid}`).update(data);
   console.log('✅ Felhasználói adatok sikeresen frissitve!');
  } catch (err) {
   console.error(err);
  }
 }

 async getPossibleMatch(uid: string) {
  const uProf = await this.fireStore.firestore.doc(`users/${uid}`).get();
  return uProf.data();
 }
}
