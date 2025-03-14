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
  @Output() submitData: EventEmitter<any> = new EventEmitter();
  @ViewChild('ngForm') ngForm!: NgForm;
  viewArrayValues: any[] = [];
  viewArrayKeys: any[] = [];
  labels: any = {};
  user: any;
  promotions: Promotions[] = [];
  userProfSaved: boolean = false;
  isUserCardOpen: boolean = false;
  startUpdUserProf: boolean = false;
  userProf?: UserClass;
  loggedUserSub: Subscription = Subscription.EMPTY;
  userProfSub: Subscription = Subscription.EMPTY;

  constructor(
    private config: ConfigService,
    private modalCtrl: ModalController,
    private auth: AuthService,
    private router: Router,
    private base: BaseService
  ) {}
  ngOnInit(): void {
    this.loggedUserSub = this.auth.loggedUserSubject.subscribe((usr) => {
      this.user = usr;
    });
    this.userProfSub = this.base.userProfBehSubj.subscribe((uProf) => {
      this.userProf = uProf;
    });
    // setTimeout(() => {
    //   this.getViewData();
    //   console.log(this.viewData);
    // }, 2000);
    this.setPromotion();
    this.setUProfLabels();
    console.log(this.labels);
  }
  ngAfterViewInit(): void {
    // if (this.viewData?.data)
    //   setTimeout(() => {
    //     this.ngForm.form.setValue(this.viewData.data);
    //   }, 1000);
  }
  ionViewDidEnter() {}
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
      console.log(this.userProf);
    }
  }

  async signOut() {
    await this.auth.signOut();
    this.user = null;
    console.log(this.userProf);
    this.auth.authAutoFillSubj.next(this.userProf?.email);
    this.router.navigate(['/tabs/tab2']);
  }
}
