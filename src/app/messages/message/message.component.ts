
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
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
    IonThumbnail
  ],
})
export class MessageComponent implements OnInit {
  @Input() matches: UserClass[] = []
  @Input() matchProfile?: UserClass;
  @Input() options?: Options
  messages: Messages = new Messages([]);
  message: Message = new Message();
  uProf?: UserClass;
  constructor(private base: BaseService) { }

  ngOnInit() {
    this.base.userProfBehSubj.subscribe((uProf) => {
      if (uProf) {
        this.uProf = uProf
        this.getMessages();
        this.watchMatchProfChange()
        console.log(this.messages);
      };
    });
  }

  async getMessages() {
    this.messages.messages = await this.base.getMessages(this.uProf?.uid!, this.uProf?.email!, this.matchProfile?.uid!, this.matchProfile?.email!)
  }

  watchMatchProfChange() {
    let oldMatchUid = this.matchProfile?.uid
    const int = setInterval(() => {
      if (this.matchProfile?.uid !== oldMatchUid) {
        this.getMessages();
        oldMatchUid = this.matchProfile?.uid;
        console.log(`***MASIK FELHASZNALONAK IROK****`);
      }
    }, 200);
  }

  addMessagesWithMatch() {
    this.base.addMessagesWithMatch(
      this.uProf?.uid!,
      this.uProf?.email!,
      this.matchProfile?.uid!,
      this.messages.setMessagesForFirestore()
    );
  }
  selectMatch(match: UserClass) {
    this.matchProfile = match;
    this.options!.isSelectedMatch = true;
  }
  backToMsgs() {
    this.options!.isSelectedMatch = false
  }

  onMessageSend(form: NgForm) {
    this.message = {
      message: form.value.message,
      senderUid: this.uProf?.uid!,
      sentToUid: this.matchProfile?.uid!,
      number: this.messages.messages[this.messages.messages.length - 1].number + 1,
      sentAt: new Date().toISOString() as any,
    }
    this.messages.messages.push(this.message)
    this.addMessagesWithMatch();
    const messNumber = this.message.number;
    this.message = new Message();
    this.message.number = messNumber + 1;
    form.resetForm()
  }
}