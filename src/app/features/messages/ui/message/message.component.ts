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
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  banOutline,
  ellipsisHorizontal,
  flagOutline,
  lockOpenOutline,
  removeCircleOutline,
  shieldCheckmarkOutline,
  trashOutline,
} from 'ionicons/icons';

import { Message } from '../../../../shared/models/message.model';
import { Options } from '../../../../shared/models/options.model';
import { MatchParts, UserClass } from '../../../../shared/models/user.model';
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
  @Output() messageSent = new EventEmitter<{
    matchProfile: UserClass;
    message: Message;
  }>();
  @Output() matchRemoved = new EventEmitter<UserClass>();

  readonly messagesStore = inject(MessagesStore);

  private profileStore = inject(ProfileStore);
  private userProfile?: UserClass;
  private pendingScrollToBottom = false;
  private lastRenderedMessageSignature = '';
  isConversationMenuOpen = false;
  moderationNoticeKey?: string;
  readonly fallbackAvatar =
    'https://img.freepik.com/free-vector/user-circles-set_78370-4704.jpg?t=st=1741696833~exp=1741700433~hmac=5c4d9770452bab7cb12b3a38cead02ffcd3f50b45d75a0da6324820dc1bd3df2&w=740';

  constructor() {
    addIcons({
      banOutline,
      ellipsisHorizontal,
      flagOutline,
      lockOpenOutline,
      removeCircleOutline,
      shieldCheckmarkOutline,
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
    await this.updateModerationList('blockedUsers');
    this.moderationNoticeKey = 'messages.blockedNotice';
    this.closeConversationMenu();
  }

  async unblockUser() {
    if (!this.userProfile?.uid || !this.matchProfile?.uid) {
      return;
    }

    const nextBlockedUsers = (this.userProfile.blockedUsers ?? []).filter(
      (uid) => uid !== this.matchProfile?.uid
    );

    await this.profileStore.updateProfile(this.userProfile.uid, {
      blockedUsers: nextBlockedUsers,
    });

    this.userProfile.blockedUsers = nextBlockedUsers;
    this.moderationNoticeKey = 'messages.unblockedNotice';
    this.closeConversationMenu();
  }

  async removeMatch() {
    if (!this.userProfile?.uid || !this.matchProfile?.uid) {
      return;
    }

    const removedMatch = this.matchProfile;
    const matchUid = removedMatch.uid;
    const matchParts = this.ensureMatchParts(this.userProfile);

    matchParts.matches = matchParts.matches.filter((uid) => uid !== matchUid);
    matchParts.liked = matchParts.liked.filter((uid) => uid !== matchUid);
    matchParts.superLiked = matchParts.superLiked.filter((uid) => uid !== matchUid);

    if (matchUid)
      if (!matchParts.notLiked.includes(matchUid)) {
        matchParts.notLiked.push(matchUid);
      }

    await this.profileStore.updateProfile(this.userProfile.uid, {
      matchParts,
    });

    this.userProfile.matchParts = matchParts;
    this.moderationNoticeKey = 'messages.matchRemovedNotice';
    this.messagesStore.clearMessages();
    this.closeConversationMenu();
    this.matchRemoved.emit(removedMatch);
  }

  async reportUser() {
    await this.updateModerationList('reportedUsers');
    this.moderationNoticeKey = 'messages.reportedNotice';
    this.closeConversationMenu();
  }

  private async updateModerationList(key: 'blockedUsers' | 'reportedUsers') {
    if (!this.userProfile?.uid || !this.matchProfile?.uid) {
      return;
    }

    const currentValues = Array.isArray(this.userProfile[key])
      ? this.userProfile[key]
      : [];
    const nextValues = currentValues.includes(this.matchProfile.uid)
      ? currentValues
      : [...currentValues, this.matchProfile.uid];

    await this.profileStore.updateProfile(this.userProfile.uid, {
      [key]: nextValues,
    });

    this.userProfile[key] = nextValues;
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

  private ensureMatchParts(profile: UserClass) {
    profile.matchParts ??= new MatchParts();
    profile.matchParts.matches ??= [];
    profile.matchParts.possMatches ??= [];
    profile.matchParts.liked ??= [];
    profile.matchParts.notLiked ??= [];
    profile.matchParts.superLiked ??= [];

    return profile.matchParts;
  }
}
