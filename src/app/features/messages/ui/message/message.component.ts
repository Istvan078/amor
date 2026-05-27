import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import {
  IonAvatar,
  IonButton,
  IonIcon,
  IonTextarea,
  AlertController,
} from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  banOutline,
  chatbubbleEllipsesOutline,
  chevronForwardOutline,
  ellipsisHorizontal,
  flagOutline,
  lockOpenOutline,
  removeCircleOutline,
  sendOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  trashOutline,
} from 'ionicons/icons';

import { Message } from '../../../../shared/models/message.model';
import { Options } from '../../../../shared/models/options.model';
import { UserClass } from '../../../../shared/models/user.model';
import { ModerationStore } from '../../../moderation/store/moderation.store';
import { ProfileStore } from '../../../profile/store/profile.store';
import { MessagesStore } from '../../store/messages.store';

@Component({
  selector: 'app-message',
  templateUrl: './message.component.html',
  styleUrls: ['./message.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    IonTextarea,
    IonButton,
    IonIcon,
    IonAvatar,
    TranslocoDirective,
  ],
})
export class MessageComponent implements AfterViewChecked, OnChanges {
  @ViewChild('messageThread', { read: ElementRef })
  private messageThread?: ElementRef<HTMLElement>;

  @Input() matches: UserClass[] = [];
  @Input() matchProfile?: UserClass;
  @Input() options?: Options;
  @Input() conversationPreviews: Record<
    string,
    {
      hasMessages: boolean;
      isLastMessageMine: boolean;
      lastMessage: string;
      unreadCount: number;
    }
  > = {};
  @Output() messageSent = new EventEmitter<{
    matchProfile: UserClass;
    message: Message;
  }>();
  @Output() matchRemoved = new EventEmitter<UserClass>();

  readonly messagesStore = inject(MessagesStore);

  private moderationStore = inject(ModerationStore);
  private profileStore = inject(ProfileStore);
  private alertCtrl = inject(AlertController);
  private transloco = inject(TranslocoService);
  private userProfile?: UserClass;
  private pendingScrollToBottom = false;
  private lastRenderedMessageSignature = '';
  isConversationMenuOpen = false;
  moderationNoticeKey?: string;
  readonly fallbackAvatar =
    'https://img.freepik.com/free-vector/user-circles-set_78370-4704.jpg?t=st=1741696833~exp=1741700433~hmac=5c4d9770452bab7cb12b3a38cead02ffcd3f50b45d75a0da6324820dc1bd3df2&w=740';

  constructor() {
    addIcons({
      arrowBackOutline,
      banOutline,
      chatbubbleEllipsesOutline,
      chevronForwardOutline,
      ellipsisHorizontal,
      flagOutline,
      lockOpenOutline,
      removeCircleOutline,
      sendOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      trashOutline,
    });

    effect(() => {
      this.userProfile = this.profileStore.profile() ?? undefined;
      void this.loadMessages();
    });
  }

  ngAfterViewChecked() {
    const messageSignature = this.messagesStore
      .messages()
      .map((message) => `${message.number}:${message.message}`)
      .join('|');

    if (messageSignature !== this.lastRenderedMessageSignature) {
      this.lastRenderedMessageSignature = messageSignature;
      this.pendingScrollToBottom = true;
    }

    if (this.pendingScrollToBottom) {
      this.pendingScrollToBottom = false;
      this.scrollThreadToBottom();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['matchProfile']) {
      this.isConversationMenuOpen = false;
      this.moderationNoticeKey = undefined;
      void this.loadMessages();
    }
  }

  async loadMessages() {
    if (!this.userProfile || !this.matchProfile) {
      this.messagesStore.clearMessages();
      return;
    }

    await this.messagesStore.loadMessages(this.userProfile, this.matchProfile);
    this.pendingScrollToBottom = true;
  }

  getProfileImage(profile?: UserClass) {
    return profile?.pictures?.[0]?.url || this.fallbackAvatar;
  }

  getDisplayName(profile?: UserClass) {
    return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  }

  isOwnMessage(message: Message) {
    return !!this.userProfile?.uid && message.senderUid === this.userProfile.uid;
  }

  isReadReceiptVisible(message: Message) {
    return this.isOwnMessage(message) && message.isRead === true;
  }

  formatMessageTime(date?: Date) {
    if (!date) {
      return '';
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  get isCurrentMatchBlocked() {
    return !!(
      this.userProfile?.blockedUsers?.length &&
      this.matchProfile?.uid &&
      this.userProfile.blockedUsers.includes(this.matchProfile.uid)
    );
  }

  isMatchBlocked(match?: UserClass) {
    return !!(
      this.userProfile?.blockedUsers?.length &&
      match?.uid &&
      this.userProfile.blockedUsers.includes(match.uid)
    );
  }

  getConversationPreview(match: UserClass) {
    if (!match.uid) {
      return {
        hasMessages: false,
        isLastMessageMine: false,
        lastMessage: '',
        unreadCount: 0,
      };
    }

    return (
      this.conversationPreviews[match.uid] ?? {
        hasMessages: false,
        isLastMessageMine: false,
        lastMessage: '',
        unreadCount: 0,
      }
    );
  }

  formatUnreadCount(unreadCount: number) {
    return unreadCount > 99 ? '99+' : String(unreadCount);
  }

  selectMatch(match: UserClass) {
    this.matchProfile = match;
    this.isConversationMenuOpen = false;
    this.moderationNoticeKey = undefined;

    if (this.options) {
      this.options.isSelectedMatch = true;
    }

    void this.loadMessages();
  }

  backToMsgs() {
    this.isConversationMenuOpen = false;

    if (this.options) {
      this.options.isSelectedMatch = false;
    }
  }

  toggleConversationMenu() {
    this.isConversationMenuOpen = !this.isConversationMenuOpen;
  }

  closeConversationMenu() {
    this.isConversationMenuOpen = false;
  }

  async blockUser() {
    if (!this.userProfile || !this.matchProfile) {
      return;
    }

    await this.moderationStore.blockUser(this.userProfile, this.matchProfile);
    this.moderationNoticeKey = 'messages.blockedNotice';
    this.closeConversationMenu();
  }

  async unblockUser() {
    if (!this.userProfile || !this.matchProfile) {
      return;
    }

    await this.moderationStore.unblockUser(this.userProfile, this.matchProfile);
    this.moderationNoticeKey = 'messages.unblockedNotice';
    this.closeConversationMenu();
  }

  async removeMatch() {
    if (!this.userProfile || !this.matchProfile) {
      return;
    }

    const removedMatch = this.matchProfile;
    const confirmed = await this.confirmRemoveMatch(removedMatch);

    if (!confirmed) {
      this.closeConversationMenu();
      return;
    }

    await this.moderationStore.removeMatch(this.userProfile, removedMatch);
    this.moderationNoticeKey = 'messages.matchRemovedNotice';
    this.messagesStore.clearMessages();
    this.closeConversationMenu();
    this.matchRemoved.emit(removedMatch);
  }

  async reportUser() {
    if (!this.userProfile || !this.matchProfile) {
      return;
    }

    const reason = await this.selectReportReason();

    if (!reason) {
      this.closeConversationMenu();
      return;
    }

    await this.moderationStore.reportUser(
      this.userProfile,
      this.matchProfile,
      reason,
      this.transloco.translate(`messages.reportReasons.${reason}`)
    );
    this.moderationNoticeKey = 'messages.reportedNotice';
    this.closeConversationMenu();
  }

  async onMessageSend(form: NgForm) {
    const messageText = form.value.message?.trim();

    if (this.isCurrentMatchBlocked) {
      this.moderationNoticeKey = 'messages.blockedComposerNotice';
      return;
    }

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

    this.messageSent.emit({
      matchProfile: this.matchProfile,
      message,
    });

    form.resetForm();
    this.pendingScrollToBottom = true;
  }

  private scrollThreadToBottom() {
    queueMicrotask(() => {
      const element = this.messageThread?.nativeElement;

      if (!element) {
        return;
      }

      element.scrollTop = element.scrollHeight;
    });
  }

  private async confirmRemoveMatch(match: UserClass) {
    let confirmed = false;
    const matchName = this.getDisplayName(match) || match.firstName || '';
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('messages.removeMatchConfirmTitle'),
      message: this.transloco.translate('messages.removeMatchConfirmText', {
        name: matchName,
      }),
      cssClass: 'premium-moderation-alert remove-match-alert',
      buttons: [
        {
          text: this.transloco.translate('common.cancel'),
          role: 'cancel',
          cssClass: 'premium-alert-cancel-button',
        },
        {
          text: this.transloco.translate('messages.removeMatchConfirmButton'),
          role: 'destructive',
          cssClass: 'premium-alert-danger-button',
          handler: () => {
            confirmed = true;
          },
        },
      ],
    });

    this.closeConversationMenu();
    await alert.present();
    await alert.onDidDismiss();

    return confirmed;
  }

  private async selectReportReason() {
    let selectedReason: string | undefined;
    const reasons = [
      'fakeProfile',
      'harassment',
      'spam',
      'inappropriateContent',
      'other',
    ];
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('messages.reportReasonTitle'),
      message: this.transloco.translate('messages.reportReasonText'),
      cssClass: 'premium-moderation-alert report-reason-alert',
      inputs: reasons.map((reason, index) => ({
        type: 'radio',
        label: this.transloco.translate(`messages.reportReasons.${reason}`),
        value: reason,
        checked: index === 0,
      })),
      buttons: [
        {
          text: this.transloco.translate('common.cancel'),
          role: 'cancel',
          cssClass: 'premium-alert-cancel-button',
        },
        {
          text: this.transloco.translate('messages.reportConfirm'),
          cssClass: 'premium-alert-confirm-button',
          handler: (reason?: string) => {
            selectedReason = reason || reasons[0];
          },
        },
      ],
    });

    this.closeConversationMenu();
    await alert.present();
    await alert.onDidDismiss();

    return selectedReason;
  }

}
