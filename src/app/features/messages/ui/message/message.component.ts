import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  effect,
  inject,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCol,
  IonGrid,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonRow,
  IonTextarea,
  IonThumbnail,
} from '@ionic/angular/standalone';

import { Message } from '../../../../shared/models/message.model';
import { Options } from '../../../../shared/models/options.model';
import { UserClass } from '../../../../shared/models/user.model';
import { ProfileStore } from '../../../profile/store/profile.store';
import { MessagesStore } from '../../store/messages.store';

@Component({
  selector: 'app-message',
  templateUrl: './message.component.html',
  styleUrls: ['./message.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    IonGrid,
    IonRow,
    IonCol,
    IonList,
    IonItem,
    IonLabel,
    IonTextarea,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonThumbnail,
  ],
})
export class MessageComponent implements OnChanges {
  @Input() matches: UserClass[] = [];
  @Input() matchProfile?: UserClass;
  @Input() options?: Options;

  readonly messagesStore = inject(MessagesStore);

  private profileStore = inject(ProfileStore);
  private userProfile?: UserClass;

  constructor() {
    effect(() => {
      this.userProfile = this.profileStore.profile() ?? undefined;
      void this.loadMessages();
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['matchProfile']) {
      void this.loadMessages();
    }
  }

  async loadMessages() {
    if (!this.userProfile || !this.matchProfile) {
      this.messagesStore.clearMessages();
      return;
    }

    await this.messagesStore.loadMessages(this.userProfile, this.matchProfile);
  }

  selectMatch(match: UserClass) {
    this.matchProfile = match;

    if (this.options) {
      this.options.isSelectedMatch = true;
    }

    void this.loadMessages();
  }

  backToMsgs() {
    if (this.options) {
      this.options.isSelectedMatch = false;
    }
  }

  async onMessageSend(form: NgForm) {
    const messageText = form.value.message?.trim();

    if (!messageText || !this.userProfile || !this.matchProfile) {
      return;
    }

    const lastMessage = this.messagesStore.messages().at(-1);
    const message: Message = {
      message: messageText,
      senderUid: this.userProfile.uid!,
      sentToUid: this.matchProfile.uid!,
      number: (lastMessage?.number ?? 0) + 1,
      sentAt: new Date(),
    };

    await this.messagesStore.sendMessage(
      this.userProfile,
      this.matchProfile,
      message
    );

    form.resetForm();
  }
}
