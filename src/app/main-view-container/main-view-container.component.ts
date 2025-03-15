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
import { Subscription } from 'rxjs';
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
 @Input() name?: string;
 @Input() viewData: any;
 isUserCardOpen: boolean = false;
 @Output() submitData: EventEmitter<any> = new EventEmitter();
 @ViewChild('ngForm') ngForm!: NgForm;
 viewArrayValues: any[] = [];
 viewArrayKeys: any[] = [];
 labels: any = {};
 possMatchDetLists: any[] = [1, 2, 3];
 user: any;
 promotions: Promotions[] = [];
 userProfSaved: boolean = false;
 startUpdUserProf: boolean = false;
 userProf?: UserClass;
 selectedFiles: File[] = [];
 loggedUserSub: Subscription = Subscription.EMPTY;
 userProfSub: Subscription = Subscription.EMPTY;
 selectedFilesSub: Subscription = Subscription.EMPTY;

 constructor(
  private modalCtrl: ModalController,
  private auth: AuthService,
  private config: ConfigService,
  private router: Router,
  private base: BaseService,
  private fileServ: FilesService
 ) {}
 ngOnInit(): void {
  this.loggedUserSub = this.auth.loggedUserSubject.subscribe((usr) => {
   this.user = usr;
  });
  this.userProfSub = this.base.userProfBehSubj.subscribe((uProf) => {
   this.userProf = uProf;
  });
  this.selectedFilesSub = this.config.selectedFilesSubj.subscribe((files) => {
   this.selectedFiles = files;
   console.log('this.selectedFiles');
  });
  this.base.isUserCardOpenSubj.subscribe(
   (isOpen) => (this.isUserCardOpen = isOpen)
  );
  this.setPromotion();
  this.setUProfLabels();
 }
 ngAfterViewInit(): void {}
 ngOnDestroy(): void {
  if (this.loggedUserSub) this.loggedUserSub.unsubscribe();
  if (this.userProfSub) this.userProfSub.unsubscribe();
 }
 getViewData() {
  if (this.viewData?.firstName) {
   this.viewArrayValues = Object.values(this.viewData);
   this.labels = this.config.getLabels(true);
   this.viewArrayKeys = Object.keys(this.viewData);
  }
  if (this.viewData?.data) {
   this.viewArrayValues = Object.values(this.viewData.data);
   this.viewArrayKeys = Object.keys(this.viewData.data);
  }
 }

 setPromotion() {
  this.promotions = this.config.getPromotions();
 }
 setUProfLabels() {
  this.labels = this.config.getLabels(true);
 }
 onSubmit(form: NgForm) {
  console.log(form.value);
  this.submitData.emit(form.value);
 }

 subToSelFilesSubj() {
  // this.selectedFilesSub = this.config.selectedFilesSubj!.subscribe((files) => {
  //  this.selectedFiles = files;
  //  console.log('this.selectedFiles');
  // });
  // setTimeout(() => {
  //  console.log(this.config.selectedFilesSubj?.value);
  // }, 5000);
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
  if (userProf?.uid) await this.base.updateUserProf(userProf.uid, userProf);
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
  this.router.navigate(['/amor/login']);
 }
}
