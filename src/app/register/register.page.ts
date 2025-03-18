import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';
import { ConfigService } from '../services/config.service';
import { UserClass } from '../models/user.model';
import { ModalController } from '@ionic/angular';
import { IonModalPage } from '../modals/ion-modal/ion-modal.page';
import { Router } from '@angular/router';

type registrationData = {
 data: {};
 labels: string[];
};

@Component({
 selector: 'app-register',
 templateUrl: 'register.page.html',
 styleUrls: ['register.page.scss'],
 standalone: false,
})
export class RegisterPage implements OnInit {
 registrationData!: registrationData;
 user: any;
 labels: any;
 constructor(
  private auth: AuthService,
  private base: BaseService,
  private config: ConfigService,
  private modalCtrl: ModalController,
  private router: Router
 ) {}
 ngOnInit(): void {
  this.setRegistrationData();
  this.labels = this.config.getLabels(true);
  this.auth.loggedUserSubject.subscribe((usr) => {
   this.user = usr;
  });
  console.log(this.labels);
 }
 setRegistrationData() {
  this.registrationData = {
   data: new UserClass(),
   labels: this.config.getLabels(true),
  };
 }
 async getSubmittedData(data: any) {
  console.log(data); // ELMENTENI ADATBAZISBA
 }

 async createModal(cProps: {}) {
  const ionModalRef = await this.modalCtrl.create({
   component: IonModalPage,
   animated: true,
  });
  ionModalRef.componentProps = cProps;
  ionModalRef.present();
  return ionModalRef;
 }

 async regUser() {
  let profCreatedSuccesfully: boolean = false;
  if (!this.user) {
   const ionModal = await this.createModal({ regFirstPhase: true });
   const data = await ionModal.onWillDismiss();
   if (data.role === 'confirm') {
    const userCreds = await this.auth.registerEmail(data.data);
    const ionModal2 = await this.createModal({
     regSecondPhase: true,
     labels: this.labels,
    });
    const data2 = await ionModal2.onWillDismiss();
    if (
     data2.role === 'created-successfully' &&
     (!this.user?.uid || this.user?.uid)
    ) {
     await this.createUserProf(data2);
     profCreatedSuccesfully = true;
     this.base.userProfCreatedSubject.next(true);
     if (!this.user?.uid) this.router.navigate(['/amor/login']);
     if (this.user?.uid) this.router.navigate(['/amor/tab3']);
    }
   }
  }
  if (this.user?.uid && !profCreatedSuccesfully) {
   const ionModal = await this.createModal({
    regSecondPhase: true,
    labels: this.labels,
   });
   const data = await ionModal.onWillDismiss();
   if (
    data.role === 'created-successfully' &&
    (!this.user?.uid || this.user?.uid)
   ) {
    await this.createUserProf(data);
    profCreatedSuccesfully = true;
    this.base.userProfCreatedSubject.next(true);
    if (!this.user?.uid) this.router.navigate(['/amor/login']);
    if (this.user?.uid) this.router.navigate(['/amor/tab3']);
   }
  }
 }
 async createUserProf(data: any) {
  const userProf: UserClass = data.data;
  Object.setPrototypeOf(userProf, UserClass.prototype);
  userProf.email = this.user?.email;
  userProf.calcAge();
  Object.setPrototypeOf(userProf, Object.prototype);
  await this.base.registerUserProf(this.user.uid, userProf as {});
  this.base.userProfBehSubj.next(userProf);
 }
}
