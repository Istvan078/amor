import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { UserClass } from 'src/app/models/user.model';

@Component({
  selector: 'app-ion-modal',
  templateUrl: './ion-modal.page.html',
  styleUrls: ['./ion-modal.page.scss'],
  standalone: false,
})
export class IonModalPage implements OnInit {
  email?: string;
  password?: string;
  regFirstPhase?: boolean;
  regSecondPhase?: boolean;
  labels?: any = {};
  userProf: UserClass = new UserClass();
  teszt: any;

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {}

  cancel() {
    return this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    let data: any = {};
    if (this.email) {
      data = { email: this.email, password: this.password };
    }
    if (this.userProf.firstName) {
      data = this.userProf;
    }
    return this.modalCtrl.dismiss(data, 'confirm');
  }
}
