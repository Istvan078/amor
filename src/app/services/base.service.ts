import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BaseService {
  userProfBehSubj: BehaviorSubject<any> = new BehaviorSubject(null);
  constructor(private fireStore: Firestore) {}
  async getUserProf(uid: string) {
    try {
      const collectionRef = collection(this.fireStore, 'users');
      const docRef = doc(collectionRef, uid);
      const document = (await getDoc(docRef)).data();
      return document;
    } catch (error) {
      return console.error(error);
    }
  }

  async registerUserProf(uid: string, data: any) {
    try {
      const db = getFirestore();
      // const collectionRef = collection(this.fireStore, 'amor/users/' + uid);
      // const docRef = await addDoc(collectionRef, data);
      await setDoc(doc(db, 'users', uid), data);
      // const userRef = this.fireStore.collection('users').doc(uid); // 🔥 Helyes útvonal

      // await userRef.set(data); // 🔥 Felülírja vagy létrehozza a dokumentumot
      // console.log(docRef);
      console.log('✅ Felhasználói adatok sikeresen feltöltve Firestore-ba!');
    } catch (error) {
      console.error('❌ Hiba történt a Firestore mentés során:', error);
    }
  }
  async updateUserProf(uid: string, data: any) {
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'users', uid), data);
      console.log('✅ Felhasználói adatok sikeresen frissitve!');
    } catch (err) {
      console.error(err);
    }
  }
}
