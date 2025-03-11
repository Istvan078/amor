import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { ConfigService } from '../services/config.service';
import { ModalController } from '@ionic/angular';
import { IonModalPage } from '../modals/ion-modal/ion-modal.page';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-main-view-container',
  templateUrl: './main-view-container.component.html',
  styleUrls: ['./main-view-container.component.scss'],
  standalone: false,
})
export class MainViewContainerComponent implements OnInit, AfterViewInit {
  @Input() name?: string;
  @Input() viewData: any;
  @Output() submitData: EventEmitter<any> = new EventEmitter();
  @ViewChild('ngForm') ngForm!: NgForm;
  viewArrayValues: any[] = [];
  viewArrayKeys: any[] = [];
  labels: any = {};
  user: any;
  constructor(
    private config: ConfigService,
    private modalCtrl: ModalController,
    private auth: AuthService
  ) {}
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
  ngOnInit(): void {
    this.auth.loggedUserSubject.subscribe((usr) => {
      this.user = usr;
      console.log(this.user.uid);
    });
    setTimeout(() => {
      this.getViewData();
      console.log(this.viewData);
    }, 2000);
  }
  ngAfterViewInit(): void {
    // if (this.viewData?.data)
    //   setTimeout(() => {
    //     this.ngForm.form.setValue(this.viewData.data);
    //   }, 1000);
  }
  onSubmit(form: NgForm) {
    console.log(form.value);
    this.submitData.emit(form.value);
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
    if (!this.user) {
      const ionModal = await this.createModal({ regFirstPhase: true });
      const data = await ionModal.onWillDismiss();
      console.log(data);
      if (data.role === 'confirm') {
        this.submitData.emit(data.data);
        const ionModal = await this.createModal({ regSecondPhase: true });
      }
    }
    if (this.user?.uid) {
      console.log(this.viewData);
      const ionModal = await this.createModal({
        regSecondPhase: true,
        labels: this.viewData.labels,
      });
      const data = await ionModal.onWillDismiss();
      console.log(data);
    }
  }
}
