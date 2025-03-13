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
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit {
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
        data2.data.email = userCreds.user?.email;
        await this.base.registerUserProf(userCreds.user!.uid, data2.data);
        this.base.userProfBehSubj.next(data2.data);
        profCreatedSuccesfully = true;
        if (data2.role === 'created-successfully' && !this.user?.uid)
          this.router.navigate(['/tabs/tab2']);
        if (data2.role === 'created-successfully' && this.user?.uid)
          this.router.navigate(['/tabs/tab3']);
      }
    }
    if (this.user?.uid && !profCreatedSuccesfully) {
      const ionModal = await this.createModal({
        regSecondPhase: true,
        labels: this.labels,
      });
      const data = await ionModal.onWillDismiss();
      data.data.email = this.user?.email;
      await this.base.registerUserProf(this.user.uid, data.data);
      this.base.userProfBehSubj.next(data.data);
      profCreatedSuccesfully = true;
      if (data.role === 'created-successfully' && !this.user?.uid)
        this.router.navigate(['/tabs/tab2']);
      if (data.role === 'created-successfully' && this.user?.uid)
        this.router.navigate(['/tabs/tab3']);
    }
  }
}
