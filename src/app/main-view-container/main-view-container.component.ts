import {
 AfterViewInit,
 Component,
 EventEmitter,
 Input,
 OnDestroy,
 OnInit,
 Output,
 ViewChild,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { ConfigService } from '../services/config.service';
import { ModalController } from '@ionic/angular';
import { IonModalPage } from '../modals/ion-modal/ion-modal.page';
import { AuthService } from '../services/auth.service';
import { Promotions } from '../models/promotions.model';
import { Router } from '@angular/router';
import { BaseService } from '../services/base.service';
import { UserClass } from '../models/user.model';
import { Observable, Subscription } from 'rxjs';
import { FilesService } from '../services/files.service';

@Component({
 selector: 'app-main-view-container',
 templateUrl: './main-view-container.component.html',
 styleUrls: ['./main-view-container.component.scss'],
 standalone: false,
})
export class MainViewContainerComponent
 implements OnInit, AfterViewInit, OnDestroy
{
 @Input() matchProfiles: any;
 isUserCardOpen: boolean = false;
 @ViewChild('ngForm') ngForm!: NgForm;
 labels: any = {};
 possMatchDetLists: any[] = [];
 matchProf?: UserClass;
 user: any;
 promotions: Promotions[] = [];
 userProfSaved: boolean = false;
 startUpdUserProf: boolean = false;
 isMatchDetailsOpen: boolean = false;
 userProf?: UserClass;
 selectedFiles: File[] = [];
 loggedUserSub: Subscription = Subscription.EMPTY;
 userProfSub: Subscription = Subscription.EMPTY;
 selectedFilesSub: Subscription = Subscription.EMPTY;
 initMainViewSubjectSub: Subscription = Subscription.EMPTY;

 constructor(
  private modalCtrl: ModalController,
  private auth: AuthService,
  private config: ConfigService,
  private router: Router,
  private base: BaseService,
  private fileServ: FilesService
 ) {}
 ngOnInit(): void {
  if (window.innerWidth < 400) this.isMatchDetailsOpen = true;
  this.config.initMainViewSubject.subscribe((isInit) => {
   if (isInit) {
    this.setMatchProfiles();
    this.setPromotion();
    this.setUProfLabels();
    console.log(`****INIT MAIN VIEW****`);
   }
  });
  this.loggedUserSub = this.auth.loggedUserSubject.subscribe((usr) => {
   this.user = usr;
   console.log(`LOGED USER MAINVIEW`);
  });
  this.userProfSub = this.base.userProfBehSubj.subscribe((uProf) => {
   this.userProf = uProf;
   console.log(`UserProf MAINVIEW`);
  });
  this.selectedFilesSub = this.config.selectedFilesSubj.subscribe((files) => {
   this.selectedFiles = files;
  });
  this.base.isUserCardOpenSubj.subscribe(
   (isOpen) => (this.isUserCardOpen = isOpen)
  );
 }
 ionViewWillEnter() {
  // Ez a metódus újra lefut, amikor az oldal újra megjelenik
  console.log('Page is about to enter');
 }
 ngAfterViewInit(): void {}
 ngOnDestroy(): void {
  if (this.loggedUserSub) this.loggedUserSub.unsubscribe();
  if (this.userProfSub) this.userProfSub.unsubscribe();
  if (this.initMainViewSubjectSub) this.initMainViewSubjectSub.unsubscribe();
  if (this.selectedFilesSub) this.selectedFilesSub.unsubscribe();
 }

 setPromotion() {
  this.promotions = this.config.getPromotions();
 }
 setUProfLabels() {
  this.possMatchDetLists = [];
  this.labels = this.config.getLabels(true);
  let isListNumber: any;
  this.labels.userProfLabels.map((label: any, i: number) => {
   if (typeof label?.listNum !== 'number' && label?.listNum) {
    isListNumber = label?.listNum(this.matchProf);
    label.listNum = isListNumber;
   }
   if (
    label?.listNum &&
    !this.possMatchDetLists.includes(label?.listNum) &&
    typeof label?.listNum === 'number'
   )
    this.possMatchDetLists.push(label?.listNum);
   if (isListNumber && !this.possMatchDetLists.includes(isListNumber))
    this.possMatchDetLists.push(isListNumber);
  });
 }

 setMatchProfiles() {
  let matchProfsArr: any[] = [];
  let isMapFuncStarted: boolean = false;
  const obs = new Observable((obs) => {
   const int = setInterval(() => {
    if (this.matchProfiles?.length && !isMapFuncStarted) {
     this.matchProfiles.map(async (matchUid: any) => {
      isMapFuncStarted = true;
      const matchProf = await this.base.getPossibleMatch(matchUid);
      matchProfsArr.push(matchProf);
     });
    }
    if (
     matchProfsArr.length === this.matchProfiles?.length &&
     isMapFuncStarted
    ) {
     obs.next(matchProfsArr);
     clearInterval(int);
    }
   }, 200);
  }).subscribe((matchProfsArr) => {
   this.matchProfiles = matchProfsArr;
   this.matchProf = this.matchProfiles[0];
   this.matchProf!['index'] = 0;
   this.setUProfLabels();
   obs.unsubscribe();
  });
 }
 changeMatchProf() {
  if (this.matchProf!['index'] !== this.matchProfiles.length - 1) {
   const index = this.matchProf!['index'];
   this.matchProf = this.matchProfiles[index + 1];
   this.matchProf!['index'] = index + 1;
   this.setUProfLabels();
  }
 }
 openUserCard() {
  this.isUserCardOpen = true;
 }

 startUpdateUserProf() {
  this.startUpdUserProf = true;
 }

 async updateUserProf() {
  const userProf = { ...this.userProf };
  userProf.uid = this.user.uid;
  const claims = {
   gender: userProf.gender,
   lookingForGender: userProf.lookingForGender,
   lookingForAge: userProf.lookingForAge,
   lookingForDistance: userProf.lookingForDistance,
  };
  if (userProf?.uid) {
   await this.base.updateUserProf(userProf.uid, userProf);
   this.auth.setCustomClaims(userProf.uid, claims);
  }
 }

 onSelectChoices(eventObj: any, labelKey: any) {
  const { value } = eventObj.detail;
  const { checked: isChecked } = eventObj.detail;
  let isDeletedArrEl: boolean = false;
  if (this.userProf) {
   if (this.userProf[labelKey]?.length) {
    if (!isChecked && this.userProf[labelKey]?.includes(value.value)) {
     const alreadyInArrInd = this.userProf[labelKey].findIndex(
      (act: any) => act === value.value
     );
     this.userProf[labelKey].splice(alreadyInArrInd, 1);
     isDeletedArrEl = true;
    }
    if (isChecked) {
     this.userProf[labelKey].push(value.value);
    }
   }
   if (!this.userProf[labelKey]?.length && !isDeletedArrEl)
    this.userProf![labelKey] = [value.value];
  }
 }

 savePictures() {
  this.fileServ.addPictures(this.userProf!.uid!, { ...this.userProf });
 }

 async signOut() {
  await this.auth.signOut();
  this.user = null;
  this.auth.authAutoFillSubj.next(this.userProf?.email);
  this.userProf = undefined;
  this.matchProf = undefined;
  this.matchProfiles = [];
  this.router.navigate(['/amor/login']);
 }
}
