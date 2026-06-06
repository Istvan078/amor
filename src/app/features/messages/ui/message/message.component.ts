import {
  AfterViewChecked,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
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
  briefcaseOutline,
  calendarOutline,
  chatbubbleEllipsesOutline,
  chevronBackOutline,
  chevronForwardOutline,
  closeOutline,
  ellipsisHorizontal,
  flagOutline,
  heartOutline,
  happyOutline,
  imagesOutline,
  locationOutline,
  lockOpenOutline,
  personCircleOutline,
  removeCircleOutline,
  schoolOutline,
  sendOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  starOutline,
  trashOutline,
} from 'ionicons/icons';
import { SwiperContainer } from 'swiper/element';

import {
  Message,
  MessageGif,
  MessageReaction,
  MessageType,
} from '../../../../shared/models/message.model';
import { Options } from '../../../../shared/models/options.model';
import { UserClass } from '../../../../shared/models/user.model';
import { translatedProfileValue } from '../../../../shared/i18n/profile-value-labels';
import { ModerationStore } from '../../../moderation/store/moderation.store';
import { ProfileStore } from '../../../profile/store/profile.store';
import { MessagesStore } from '../../store/messages.store';

@Component({
  selector: 'app-message',
  templateUrl: './message.component.html',
  styleUrls: ['./message.component.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    FormsModule,
    IonTextarea,
    IonButton,
    IonIcon,
    IonAvatar,
    TranslocoDirective,
  ],
})
export class MessageComponent implements AfterViewChecked, OnChanges, OnDestroy {
  @ViewChild('messageThread', { read: ElementRef })
  private messageThread?: ElementRef<HTMLElement>;
  @ViewChild('composerTextarea')
  private composerTextarea?: IonTextarea;
  @ViewChild('matchPhotoSwiper')
  private matchPhotoSwiper?: ElementRef<SwiperContainer>;

  @Input() matches: UserClass[] = [];
  @Input() matchProfile?: UserClass;
  @Input() options?: Options;
  @Input() hasPremiumAccess = false;
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
  @Output() readReceiptsPremiumRequested = new EventEmitter<void>();

  readonly messagesStore = inject(MessagesStore);

  private moderationStore = inject(ModerationStore);
  private profileStore = inject(ProfileStore);
  private alertCtrl = inject(AlertController);
  private transloco = inject(TranslocoService);
  private document = inject(DOCUMENT);
  private userProfile?: UserClass;
  private pendingScrollToBottom = false;
  private lastRenderedMessageSignature = '';
  private typingStopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingWriteAt = 0;
  private pendingReactionKeys = new Set<string>();
  isConversationMenuOpen = false;
  isMatchProfileOpen = false;
  isMatchPhotoViewerOpen = false;
  activeComposerPanel: 'emoji' | 'gif' | null = null;
  activeReactionPickerMessageId?: string;
  activeMatchPhotoIndex = 0;
  moderationNoticeKey?: string;
  readReceiptsSaving = false;
  readonly profileValueText = translatedProfileValue;
  readonly quickReactionEmojis = ['❤️', '😂', '😍', '🔥', '👏', '😮'];
  readonly composerEmojis = [
    '❤️',
    '😍',
    '😘',
    '😂',
    '🔥',
    '✨',
    '😉',
    '😊',
    '🥰',
    '👏',
    '💯',
    '😇',
  ];
  readonly localGifs: MessageGif[] = [
    {
      id: 'amor-heartbeat',
      title: 'Heartbeat',
      url: 'assets/gifs/amor-heartbeat.svg',
      previewUrl: 'assets/gifs/amor-heartbeat.svg',
      alt: 'Animated heartbeat card',
      source: 'local',
    },
    {
      id: 'amor-spark',
      title: 'First spark',
      url: 'assets/gifs/amor-spark.svg',
      previewUrl: 'assets/gifs/amor-spark.svg',
      alt: 'Animated first spark card',
      source: 'local',
    },
    {
      id: 'amor-cheers',
      title: 'Cheers',
      url: 'assets/gifs/amor-cheers.svg',
      previewUrl: 'assets/gifs/amor-cheers.svg',
      alt: 'Animated celebration card',
      source: 'local',
    },
  ];
  readonly fallbackAvatar =
    'https://img.freepik.com/free-vector/user-circles-set_78370-4704.jpg?t=st=1741696833~exp=1741700433~hmac=5c4d9770452bab7cb12b3a38cead02ffcd3f50b45d75a0da6324820dc1bd3df2&w=740';

  constructor() {
    addIcons({
      arrowBackOutline,
      banOutline,
      briefcaseOutline,
      calendarOutline,
      chatbubbleEllipsesOutline,
      chevronBackOutline,
      chevronForwardOutline,
      closeOutline,
      ellipsisHorizontal,
      flagOutline,
      happyOutline,
      heartOutline,
      imagesOutline,
      locationOutline,
      lockOpenOutline,
      personCircleOutline,
      removeCircleOutline,
      schoolOutline,
      sendOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      starOutline,
      trashOutline,
    });

    effect(() => {
      this.userProfile = this.profileStore.profile() ?? undefined;
      void this.loadMessages();
    });
  }

  ngAfterViewChecked() {
    this.syncMobileMessageViewState();

    const messageSignature = this.messagesStore
      .messages()
      .map(
        (message) =>
          `${message.id ?? message.number}:${message.messageType}:${message.message}:${message.gif?.id ?? ''}`
      )
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
      this.clearLocalTypingStatus(
        changes['matchProfile'].previousValue as UserClass | undefined
      );
      this.isConversationMenuOpen = false;
      this.isMatchProfileOpen = false;
      this.activeComposerPanel = null;
      this.activeReactionPickerMessageId = undefined;
      this.closeMatchPhotoViewer();
      this.moderationNoticeKey = undefined;
      void this.loadMessages();
    }

    this.syncMobileMessageViewState();
  }

  ngOnDestroy() {
    this.clearLocalTypingStatus();
    this.document.body.classList.remove('is-mobile-messages-tab');
    this.document.body.classList.remove('is-mobile-message-view');
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
    return (
      this.hasReadReceiptsEnabled() &&
      this.isOwnMessage(message) &&
      message.isRead === true
    );
  }

  hasReadReceiptsEnabled() {
    return this.userProfile?.readReceiptsEnabled === true;
  }

  async enableReadReceipts() {
    if (!this.hasPremiumAccess) {
      this.readReceiptsPremiumRequested.emit();
      return;
    }

    if (!this.userProfile?.uid || this.hasReadReceiptsEnabled()) {
      return;
    }

    this.readReceiptsSaving = true;

    try {
      await this.profileStore.updateProfile(this.userProfile.uid, {
        readReceiptsEnabled: true,
      });
    } finally {
      this.readReceiptsSaving = false;
    }
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

  getMessageTrackId(message: Message, index: number) {
    return message.id ?? `${message.senderUid}-${message.number}-${index}`;
  }

  isGifMessage(message: Message) {
    return message.messageType === 'gif' && !!message.gif?.url;
  }

  getMessageGifAlt(message: Message) {
    return message.gif?.alt || message.gif?.title || 'GIF';
  }

  getVisibleReactions(message: Message) {
    return (message.reactions ?? []).filter(
      (reaction) => reaction.userUids.length > 0
    );
  }

  getDisplayReaction(message: Message) {
    const visibleReactions = this.getVisibleReactions(message);

    if (!visibleReactions.length) {
      return undefined;
    }

    if (this.userProfile?.uid) {
      const ownReaction = visibleReactions.find((reaction) =>
        reaction.userUids.includes(this.userProfile!.uid!)
      );

      if (ownReaction) {
        return ownReaction;
      }
    }

    return [...visibleReactions].sort(
      (reactionA, reactionB) =>
        (reactionB.updatedAt?.getTime() ?? 0) -
        (reactionA.updatedAt?.getTime() ?? 0)
    )[0];
  }

  hasMessageReactions(message: Message) {
    return !!this.getDisplayReaction(message);
  }

  hasReactionFromUser(message: Message, emoji: string) {
    return !!(
      this.userProfile?.uid &&
      message.reactions?.some(
        (reaction) =>
          reaction.emoji === emoji &&
          reaction.userUids.includes(this.userProfile!.uid!)
      )
    );
  }

  getReactionCountText(reaction: MessageReaction) {
    return reaction.userUids.length > 1 ? String(reaction.userUids.length) : '';
  }

  isReactionPending(message: Message, emoji: string) {
    return !!message.id && this.pendingReactionKeys.has(`${message.id}:${emoji}`);
  }

  isAnyReactionPending(message: Message) {
    return !!(
      message.id &&
      this.quickReactionEmojis.some((emoji) =>
        this.pendingReactionKeys.has(`${message.id}:${emoji}`)
      )
    );
  }

  isReactionPickerOpen(message: Message) {
    return !!message.id && this.activeReactionPickerMessageId === message.id;
  }

  toggleReactionPicker(message: Message) {
    if (this.isCurrentMatchBlocked || !message.id) {
      return;
    }

    this.activeComposerPanel = null;
    this.activeReactionPickerMessageId =
      this.activeReactionPickerMessageId === message.id
        ? undefined
        : message.id;
  }

  async toggleMessageReaction(message: Message, emoji: string) {
    if (
      this.isCurrentMatchBlocked ||
      !this.userProfile ||
      !this.matchProfile ||
      !message.id
    ) {
      return;
    }

    const reactionKey = `${message.id}:${emoji}`;

    if (this.pendingReactionKeys.has(reactionKey)) {
      return;
    }

    this.pendingReactionKeys.add(reactionKey);

    try {
      await this.messagesStore.toggleMessageReaction(
        this.userProfile,
        this.matchProfile,
        message,
        emoji
      );
      this.activeReactionPickerMessageId = undefined;
    } finally {
      this.pendingReactionKeys.delete(reactionKey);
    }
  }

  toggleComposerPanel(panel: 'emoji' | 'gif') {
    if (this.isCurrentMatchBlocked) {
      return;
    }

    this.activeComposerPanel =
      this.activeComposerPanel === panel ? null : panel;
    this.activeReactionPickerMessageId = undefined;
  }

  appendEmoji(form: NgForm, emoji: string) {
    if (this.isCurrentMatchBlocked) {
      return;
    }

    const control = form.controls['message'];
    const currentMessage = String(control?.value ?? '');

    control?.setValue(`${currentMessage}${emoji}`);
    this.onMessageInput();
    this.focusComposer();
  }

  async sendGif(gif: MessageGif, form: NgForm) {
    if (this.isCurrentMatchBlocked) {
      this.moderationNoticeKey = 'messages.blockedComposerNotice';
      return;
    }

    await this.sendComposedMessage(gif.title, 'gif', gif);
    form.controls['message']?.setValue('');
    this.activeComposerPanel = null;
    this.clearLocalTypingStatus();
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

  isMatchOnline(match: UserClass) {
    if (match.showOnlineStatus === false) {
      return false;
    }

    if (!match.isOnline) {
      return false;
    }

    const lastSeenAt = this.getTimestampValue(
      match['lastSeenAt'] ?? match['lastActiveAt']
    );

    if (!lastSeenAt) {
      return false;
    }

    return Date.now() - lastSeenAt.getTime() < 2 * 60 * 1000;
  }

  selectMatch(match: UserClass) {
    this.clearLocalTypingStatus(this.matchProfile);
    this.matchProfile = match;
    this.isConversationMenuOpen = false;
    this.isMatchProfileOpen = false;
    this.activeComposerPanel = null;
    this.activeReactionPickerMessageId = undefined;
    this.closeMatchPhotoViewer();
    this.moderationNoticeKey = undefined;

    if (this.options) {
      this.options.isSelectedMatch = true;
    }

    this.syncMobileMessageViewState();
    void this.loadMessages();
  }

  backToMsgs() {
    this.isConversationMenuOpen = false;
    this.isMatchProfileOpen = false;
    this.activeComposerPanel = null;
    this.activeReactionPickerMessageId = undefined;
    this.closeMatchPhotoViewer();

    if (this.options) {
      this.options.isSelectedMatch = false;
    }

    this.syncMobileMessageViewState();
  }

  toggleConversationMenu() {
    this.isConversationMenuOpen = !this.isConversationMenuOpen;
  }

  closeConversationMenu() {
    this.isConversationMenuOpen = false;
  }

  openMatchProfile() {
    if (!this.matchProfile) {
      return;
    }

    this.isMatchProfileOpen = true;
    this.closeConversationMenu();
  }

  closeMatchProfile() {
    this.isMatchProfileOpen = false;
    this.closeMatchPhotoViewer();
  }

  getMatchPhotos(profile = this.matchProfile) {
    return profile?.pictures?.length
      ? profile.pictures
      : [{ name: 'fallback', url: this.fallbackAvatar }];
  }

  openMatchPhotoViewer(index = 0) {
    if (!this.matchProfile) {
      return;
    }

    const photos = this.getMatchPhotos(this.matchProfile);

    this.activeMatchPhotoIndex = this.clampPhotoIndex(index, photos.length);
    this.isMatchPhotoViewerOpen = true;

    queueMicrotask(() => {
      this.matchPhotoSwiper?.nativeElement.swiper?.slideTo(
        this.activeMatchPhotoIndex,
        0
      );
    });
  }

  closeMatchPhotoViewer() {
    this.isMatchPhotoViewerOpen = false;
  }

  selectMatchPhoto(index: number) {
    const photoCount = this.getMatchPhotos(this.matchProfile).length;
    this.activeMatchPhotoIndex = this.clampPhotoIndex(index, photoCount);
    this.matchPhotoSwiper?.nativeElement.swiper?.slideTo(
      this.activeMatchPhotoIndex
    );
  }

  onMatchPhotoSlideChange() {
    this.activeMatchPhotoIndex =
      this.matchPhotoSwiper?.nativeElement.swiper?.activeIndex ??
      this.activeMatchPhotoIndex;
  }

  previousMatchPhoto() {
    if (this.getMatchPhotos(this.matchProfile).length < 2) {
      return;
    }

    this.matchPhotoSwiper?.nativeElement.swiper?.slidePrev();
  }

  nextMatchPhoto() {
    if (this.getMatchPhotos(this.matchProfile).length < 2) {
      return;
    }

    this.matchPhotoSwiper?.nativeElement.swiper?.slideNext();
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

    if (!messageText) {
      return;
    }

    await this.sendComposedMessage(messageText, 'text');
    form.resetForm();
    this.activeComposerPanel = null;
    this.clearLocalTypingStatus();
    this.pendingScrollToBottom = true;
  }

  private async sendComposedMessage(
    messageText: string,
    messageType: MessageType,
    gif?: MessageGif
  ) {
    if (!this.userProfile || !this.matchProfile) {
      return;
    }

    const lastMessage = this.messagesStore.messages().at(-1);
    const message: Message = {
      message: messageText,
      messageType,
      gif,
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
  }

  onMessageInput() {
    if (this.isCurrentMatchBlocked || !this.userProfile || !this.matchProfile) {
      return;
    }

    const now = Date.now();

    if (now - this.lastTypingWriteAt > 2500) {
      this.lastTypingWriteAt = now;
      void this.messagesStore.setTypingStatus(
        this.userProfile,
        this.matchProfile,
        true
      );
    }

    if (this.typingStopTimer) {
      clearTimeout(this.typingStopTimer);
    }

    this.typingStopTimer = setTimeout(() => {
      this.clearLocalTypingStatus();
    }, 3000);
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

  private focusComposer() {
    queueMicrotask(() => {
      void this.composerTextarea?.setFocus();
    });
  }

  private clearLocalTypingStatus(matchProfile = this.matchProfile) {
    if (this.typingStopTimer) {
      clearTimeout(this.typingStopTimer);
      this.typingStopTimer = null;
    }

    if (!this.lastTypingWriteAt) {
      return;
    }

    this.lastTypingWriteAt = 0;

    if (!this.userProfile || !matchProfile) {
      return;
    }

    void this.messagesStore.setTypingStatus(
      this.userProfile,
      matchProfile,
      false
    );
  }

  private getTimestampValue(value: unknown): Date | undefined {
    if (!value) {
      return undefined;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value;
    }

    if (typeof value === 'object' && 'toDate' in value) {
      const timestamp = value as { toDate?: () => Date };
      const date = timestamp.toDate?.();

      return date && !Number.isNaN(date.getTime()) ? date : undefined;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);

      return Number.isNaN(date.getTime()) ? undefined : date;
    }

    return undefined;
  }

  private clampPhotoIndex(index: number, photoCount: number) {
    if (photoCount < 1) {
      return 0;
    }

    return Math.min(Math.max(index, 0), photoCount - 1);
  }

  private syncMobileMessageViewState() {
    const isMobileMessagesTab = !!this.options?.phoneView;

    this.document.body.classList.toggle(
      'is-mobile-messages-tab',
      isMobileMessagesTab
    );
    this.document.body.classList.toggle(
      'is-mobile-message-view',
      !!(isMobileMessagesTab && this.options?.isSelectedMatch)
    );
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
