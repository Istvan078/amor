import { Component, Input, inject } from '@angular/core';
import {
  IonButton,
  IonIcon,
  IonText,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  chatbubbleEllipsesOutline,
  closeOutline,
  heart,
  sparklesOutline,
} from 'ionicons/icons';

import { UserClass } from '../../../../shared/models/user.model';

@Component({
  selector: 'app-its-a-match-modal',
  templateUrl: './its-a-match-modal.component.html',
  styleUrls: ['./its-a-match-modal.component.scss'],
  standalone: true,
  imports: [TranslocoDirective, IonButton, IonIcon, IonText],
})
export class ItsAMatchModalComponent {
  @Input() userProfile?: UserClass;
  @Input() matchProfile?: UserClass;

  private modalCtrl = inject(ModalController);

  constructor() {
    addIcons({
      chatbubbleEllipsesOutline,
      closeOutline,
      heart,
      sparklesOutline,
    });
  }

  get userPhoto() {
    return this.getPhotoUrl(this.userProfile);
  }

  get matchPhoto() {
    return this.getPhotoUrl(this.matchProfile);
  }

  get matchName() {
    return (
      [this.matchProfile?.firstName, this.matchProfile?.lastName]
        .filter(Boolean)
        .join(' ') || 'your match'
    );
  }

  keepDiscovering() {
    return this.modalCtrl.dismiss({ action: 'continue' });
  }

  startChat() {
    return this.modalCtrl.dismiss({ action: 'message' });
  }

  private getPhotoUrl(profile?: UserClass) {
    return (
      profile?.pictures?.[0]?.url ||
      profile?.profilePicture ||
      'https://img.freepik.com/free-vector/user-circles-set_78370-4704.jpg?t=st=1741696833~exp=1741700433~hmac=5c4d9770452bab7cb12b3a38cead02ffcd3f50b45d75a0da6324820dc1bd3df2&w=740'
    );
  }
}
