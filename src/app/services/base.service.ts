import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { BehaviorSubject } from 'rxjs';
import { Message, Messages } from '../models/message.model';

@Injectable({
 providedIn: 'root',
})
export class BaseService {
 userProfBehSubj: BehaviorSubject<any> = new BehaviorSubject(null);
 isUserCardOpenSubj: BehaviorSubject<any> = new BehaviorSubject(false);
 userProfCreatedSubject: BehaviorSubject<boolean> = new BehaviorSubject(false);
 mainDataSubject:BehaviorSubject<any> = new BehaviorSubject({});
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
 addMessagesWithMatch(
  myUid: string,
  myEmail: string,
  matchUid: string,
  message: any
 ) {
  this.fireStore.firestore
   .doc(`matches/messages/${myEmail}/${matchUid}_${myUid}`)
   .set(message);
 }
//  async getMessages(
//   myUid: string,
//   myEmail: string,
//   matchUid: string
//  ) {
//   const copiedMsgs: Message[] = []
//   const msgs = (await this.fireStore.firestore.collection(`matches/messages/${myEmail}/${matchUid}_${myUid}`)
//   .orderBy("number").limitToLast(15).get()).docs
//   msgs.map(msg => copiedMsgs.push(msg.data() as any))
//   return copiedMsgs
//  }
 async getMessages(
  myUid: string,
  myEmail: string,
  matchUid: string,
  matchEmail: string
 ) {
  const msgsCopy: Messages = new Messages([])
  const myMsgs = (await this.fireStore.firestore.doc(`matches/messages/${myEmail}/${matchUid}_${myUid}`)
  .get()).data() as Message;
  const matchMsgs = (await this.fireStore.firestore.doc(`matches/messages/${matchEmail}/${myUid}_${matchUid}`)
  .get()).data() as Message;
  const allMsgs: Message = {...myMsgs, ...matchMsgs}
  msgsCopy.messages = Object.values(allMsgs).flat();
  msgsCopy.messages.sort((a,b) => a.number - b.number)
  console.log(msgsCopy);

  // msgsCopy.messages = [...msgs]
  return msgsCopy.messages
 }
//  async getMatchMessages() {
//   const msgs = (await this.fireStore.firestore.doc(`matches/messages/${myEmail}/${matchUid}_${myUid}`)
//   .get()).data() as Message;
//  }
 updateMessagesWithMatch(
  myUid: string,
  myEmail: string,
  matchUid: string,
  message: any
 ) {
  this.fireStore.firestore
   .doc(`matches/messages/${myEmail}/${matchUid}_${myUid}`)
   .update(message);
 }
}
