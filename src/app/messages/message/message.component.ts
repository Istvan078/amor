import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonRow,
  IonTextarea,
  IonThumbnail,
} from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';

import { BaseService } from '../../services/base.service';
import { Message, Messages } from '../../shared/models/message.model';
import { Options } from '../../shared/models/options.model';
import { UserClass } from '../../shared/models/user.model';

@Component({
  selector: 'app-message',
  templateUrl: './message.component.html',
  styleUrls: ['./message.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,

    IonContent,
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
export class MessageComponent implements OnInit, OnDestroy {
  @Input() matches: UserClass[] = [];
  @Input() matchProfile?: UserClass;
  @Input() options?: Options;

  messages: Messages = new Messages([]);
  message: Message = new Message();
  uProf?: UserClass;

  private userProfileSub = Subscription.EMPTY;
  private matchWatcher?: ReturnType<typeof setInterval>;

  constructor(private base: BaseService) { }

  ngOnInit() {
    this.userProfileSub = this.base.userProfBehSubj.subscribe((uProf) => {
      if (uProf) {
        this.uProf = uProf;
        this.getMessages();
        this.watchMatchProfChange();
      }
    });
  }

  ngOnDestroy() {
    this.userProfileSub.unsubscribe();

    if (this.matchWatcher) {
      clearInterval(this.matchWatcher);
    }
  }

  async getMessages() {
    if (
      !this.uProf?.uid ||
      !this.uProf?.email ||
      !this.matchProfile?.uid ||
      !this.matchProfile?.email
    ) {
      this.messages.messages = [];
      return;
    }

    this.messages.messages = await this.base.getMessages(
      this.uProf.uid,
      this.uProf.email,
      this.matchProfile.uid,
      this.matchProfile.email
    );
  }

  watchMatchProfChange() {
    let oldMatchUid = this.matchProfile?.uid;

    if (this.matchWatcher) {
      clearInterval(this.matchWatcher);
    }

    this.matchWatcher = setInterval(() => {
      if (this.matchProfile?.uid !== oldMatchUid) {
        this.getMessages();
        oldMatchUid = this.matchProfile?.uid;
      }
    }, 200);
  }

  addMessagesWithMatch() {
    if (!this.uProf?.uid || !this.uProf?.email || !this.matchProfile?.uid) {
      return;
    }

    this.base.addMessagesWithMatch(
      this.uProf.uid,
      this.uProf.email,
      this.matchProfile.uid,
      this.messages.setMessagesForFirestore()
    );
  }

  selectMatch(match: UserClass) {
    this.matchProfile = match;

    if (this.options) {
      this.options.isSelectedMatch = true;
    }

    this.getMessages();
  }

  backToMsgs() {
    if (this.options) {
      this.options.isSelectedMatch = false;
    }
  }

  onMessageSend(form: NgForm) {
    const text = form.value.message;

    if (!text || !this.uProf?.uid || !this.matchProfile?.uid) {
      return;
    }

    const lastMessageNumber =
      this.messages.messages[this.messages.messages.length - 1]?.number ?? 0;

    this.message = {
      message: text,
      senderUid: this.uProf.uid,
      sentToUid: this.matchProfile.uid,
      number: lastMessageNumber + 1,
    };

    this.messages.messages.push(this.message);
    this.addMessagesWithMatch();

    this.message = new Message();
    this.message.number = lastMessageNumber + 2;

    form.resetForm();
  }
}