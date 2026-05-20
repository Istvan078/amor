import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';

import { Message, Messages } from '../shared/models/message.model';

@Injectable({
  providedIn: 'root',
})
export class BaseService {
  private firestore = inject(Firestore);

  userProfBehSubj = new BehaviorSubject<any>(null);
  isUserCardOpenSubj = new BehaviorSubject<boolean>(false);
  userProfCreatedSubject = new BehaviorSubject<boolean>(false);
  mainDataSubject = new BehaviorSubject<any>({});

  async getUserProf(uid: string) {
    const documentRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(documentRef);

    return snapshot.exists() ? snapshot.data() : undefined;
  }

  async getAllUserProfs() {
    const copiedUsers: any[] = [];
    const usersRef = collection(this.firestore, 'users');
    const snapshot = await getDocs(usersRef);

    snapshot.docs.forEach((userDoc) => {
      copiedUsers.push({
        uid: userDoc.id,
        ...userDoc.data(),
      });
    });

    return copiedUsers;
  }

  async registerUserProf(uid: string, data: any) {
    try {
      const userRef = doc(this.firestore, `users/${uid}`);
      await setDoc(userRef, data);

      console.log('Profile saved successfully.');
    } catch (error) {
      console.error('Profile saving failed:', error);
    }
  }

  async updateUserProf(uid: string, data: any) {
    try {
      const userRef = doc(this.firestore, `users/${uid}`);
      await updateDoc(userRef, data);

      console.log('Profile updated successfully.');
    } catch (error) {
      console.error('Profile update failed:', error);
    }
  }

  async getPossibleMatch(uid: string) {
    const userRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(userRef);

    return snapshot.exists() ? snapshot.data() : undefined;
  }

  async addMessagesWithMatch(
    myUid: string,
    myEmail: string,
    matchUid: string,
    message: any
  ) {
    const messageRef = doc(
      this.firestore,
      `matches/messages/${myEmail}/${matchUid}_${myUid}`
    );

    await setDoc(messageRef, message, {
      merge: true,
    });
  }

  async getMessages(
    myUid: string,
    myEmail: string,
    matchUid: string,
    matchEmail: string
  ) {
    const msgsCopy: Messages = new Messages([]);

    const myMessageRef = doc(
      this.firestore,
      `matches/messages/${myEmail}/${matchUid}_${myUid}`
    );

    const matchMessageRef = doc(
      this.firestore,
      `matches/messages/${matchEmail}/${myUid}_${matchUid}`
    );

    const myMessageSnapshot = await getDoc(myMessageRef);
    const matchMessageSnapshot = await getDoc(matchMessageRef);

    const myMsgs = myMessageSnapshot.exists()
      ? (myMessageSnapshot.data() as Message)
      : undefined;

    const matchMsgs = matchMessageSnapshot.exists()
      ? (matchMessageSnapshot.data() as Message)
      : undefined;

    const allMsgs: any = {
      ...(myMsgs ?? {}),
      ...(matchMsgs ?? {}),
    };

    msgsCopy.messages = Object.values(allMsgs).flat() as Message[];

    msgsCopy.messages.sort((a, b) => a.number - b.number);

    return msgsCopy.messages;
  }

  async updateMessagesWithMatch(
    myUid: string,
    myEmail: string,
    matchUid: string,
    message: any
  ) {
    const messageRef = doc(
      this.firestore,
      `matches/messages/${myEmail}/${matchUid}_${myUid}`
    );

    await setDoc(messageRef, message, {
      merge: true,
    });
  }
}