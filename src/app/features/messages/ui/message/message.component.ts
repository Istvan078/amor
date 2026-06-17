import {
  AfterViewChecked,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Keyboard, type KeyboardInfo } from '@capacitor/keyboard';
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
  checkmarkOutline,
  chatbubbleEllipsesOutline,
  chevronBackOutline,
  chevronForwardOutline,
  chevronUpOutline,
  closeCircleOutline,
  closeOutline,
  createOutline,
  ellipsisHorizontal,
  flagOutline,
  heartOutline,
  happyOutline,
  imagesOutline,
  locationOutline,
  lockOpenOutline,
  personCircleOutline,
  refreshOutline,
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
import { PublicProfile } from '../../../../shared/models/public-profile.model';
import { UserClass } from '../../../../shared/models/user.model';
import { translatedProfileValue } from '../../../../shared/i18n/profile-value-labels';
import { ModerationStore } from '../../../moderation/store/moderation.store';
import { ProfileStore } from '../../../profile/store/profile.store';
import { MessagesFacade } from '../../facades/messages.facade';

type ReportReason =
  | 'fakeProfile'
  | 'harassment'
  | 'spam'
  | 'inappropriateContent'
  | 'other';

type ReportReasonSelection = {
  customDescription?: string;
  description: string;
  reason: ReportReason;
  reasonLabel: string;
};

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
export class MessageComponent
  implements AfterViewChecked, OnChanges, OnDestroy, OnInit
{
  @ViewChild('messageThread', { read: ElementRef })
  private messageThread?: ElementRef<HTMLElement>;
  @ViewChild('composerTextarea')
  private composerTextarea?: IonTextarea;
  @ViewChild('matchPhotoSwiper')
  private matchPhotoSwiper?: ElementRef<SwiperContainer>;
  @ViewChild('reportOtherTextarea')
  private reportOtherTextarea?: ElementRef<HTMLTextAreaElement>;

  @Input() matches: PublicProfile[] = [];
  @Input() matchProfile?: PublicProfile;
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
    matchProfile: PublicProfile;
    message: Message;
  }>();
  @Output() matchRemoved = new EventEmitter<PublicProfile>();
  @Output() readReceiptsPremiumRequested = new EventEmitter<void>();

  private messagesFacade = inject(MessagesFacade);
  readonly messagesStore = this.messagesFacade.store;

  private moderationStore = inject(ModerationStore);
  private profileStore = inject(ProfileStore);
  private alertCtrl = inject(AlertController);
  private transloco = inject(TranslocoService);
  private document = inject(DOCUMENT);
  private userProfile?: UserClass;
  private pendingScrollToBottom = false;
  private pendingScrollRestore?: {
    scrollHeight: number;
    scrollTop: number;
  };
  private lastRenderedMessageSignature = '';
  private lastRenderedLatestMessageSignature = '';
  private typingStopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingWriteAt = 0;
  private pendingReactionKeys = new Set<string>();
  private pendingMessageActionIds = new Set<string>();
  private reportingMessageIds = new Set<string>();
  private keyboardHeight = 0;
  private keyboardListenerHandles: PluginListenerHandle[] = [];
  private visualViewport?: VisualViewport;
  private readonly mobileViewportResizeHandler = () => {
    this.syncMobileViewportMetrics();
    this.scheduleThreadScrollToBottom();
  };
  private reportDialogResolver?: (
    selection?: ReportReasonSelection
  ) => void;
  isConversationMenuOpen = false;
  isMatchProfileOpen = false;
  isMatchPhotoViewerOpen = false;
  activeComposerPanel: 'emoji' | 'gif' | null = null;
  activeReactionPickerMessageId?: string;
  editingMessageId?: string;
  editingMessageText = '';
  activeMatchPhotoIndex = 0;
  moderationNoticeKey?: string;
  readReceiptsSaving = false;
  isReportDialogOpen = false;
  reportDialogTitleKey = 'messages.reportReasonTitle';
  reportDialogTextKey = 'messages.reportReasonText';
  reportDialogSelectedReason: ReportReason = 'fakeProfile';
  reportDialogOtherDescription = '';
  draftMessage = '';
  readonly profileValueText = translatedProfileValue;
  readonly reportReasons: ReportReason[] = [
    'fakeProfile',
    'harassment',
    'spam',
    'inappropriateContent',
    'other',
  ];
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
      checkmarkOutline,
      chatbubbleEllipsesOutline,
      chevronBackOutline,
      chevronForwardOutline,
      chevronUpOutline,
      closeCircleOutline,
      closeOutline,
      createOutline,
      ellipsisHorizontal,
      flagOutline,
      happyOutline,
      heartOutline,
      imagesOutline,
      locationOutline,
      lockOpenOutline,
      personCircleOutline,
      refreshOutline,
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

  ngOnInit() {
    this.setupMobileViewportListeners();
    void this.setupNativeKeyboardListeners();
    this.syncMobileViewportMetrics();
  }

  ngAfterViewChecked() {
    this.syncMobileMessageViewState();

    const messages = this.messagesStore.messages();
    const messageSignature = messages
      .map(
        (message) =>
          `${message.id ?? message.clientId ?? message.number}:${message.messageType}:${message.message}:${message.gif?.id ?? ''}:${message.deliveryStatus ?? ''}:${message.isDeleted ? 'd' : ''}:${message.isEdited ? 'e' : ''}`
      )
      .join('|');
    const latestMessage = messages.at(-1);
    const latestMessageSignature = latestMessage
      ? `${latestMessage.id ?? latestMessage.clientId ?? latestMessage.number}:${latestMessage.messageType}:${latestMessage.message}:${latestMessage.gif?.id ?? ''}:${latestMessage.deliveryStatus ?? ''}:${latestMessage.isDeleted ? 'd' : ''}:${latestMessage.isEdited ? 'e' : ''}`
      : '';

    if (messageSignature !== this.lastRenderedMessageSignature) {
      const latestMessageChanged =
        latestMessageSignature !== this.lastRenderedLatestMessageSignature;
      const shouldStickToBottom =
        this.pendingScrollToBottom || this.isThreadNearBottom();

      this.lastRenderedMessageSignature = messageSignature;
      this.lastRenderedLatestMessageSignature = latestMessageSignature;

      if (this.pendingScrollRestore) {
        this.restoreThreadScrollPosition();
      } else if (latestMessageChanged && shouldStickToBottom) {
        this.pendingScrollToBottom = true;
      }
    }

    if (this.pendingScrollToBottom) {
      this.pendingScrollToBottom = false;
      this.scrollThreadToBottom();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['matchProfile']) {
      this.clearLocalTypingStatus(
        changes['matchProfile'].previousValue as PublicProfile | undefined
      );
      this.isConversationMenuOpen = false;
      this.isMatchProfileOpen = false;
      this.activeComposerPanel = null;
      this.activeReactionPickerMessageId = undefined;
      this.closeMatchPhotoViewer();
      this.moderationNoticeKey = undefined;
      this.draftMessage = '';
      void this.loadMessages();
    }

    this.syncMobileMessageViewState();
  }

  ngOnDestroy() {
    this.resolveReportDialog(undefined);
    this.clearLocalTypingStatus();
    this.removeMobileViewportListeners();
    this.removeNativeKeyboardListeners();
    this.clearMobileViewportMetrics();
    this.document.body.classList.remove('is-mobile-messages-tab');
    this.document.body.classList.remove('is-mobile-message-view');
    this.document.body.classList.remove('is-mobile-keyboard-open');
  }

  async loadMessages() {
    if (!this.userProfile || !this.matchProfile) {
      this.messagesFacade.clearMessages();
      return;
    }

    await this.messagesFacade.loadMessages(this.userProfile, this.matchProfile);
    this.pendingScrollToBottom = true;
  }

  async loadOlderMessages() {
    if (
      !this.userProfile ||
      !this.matchProfile ||
      !this.messagesStore.hasOlderMessages() ||
      this.messagesStore.loadingOlderMessages()
    ) {
      return;
    }

    const element = this.messageThread?.nativeElement;

    this.pendingScrollRestore = element
      ? {
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      }
      : undefined;
    const previousMessageCount = this.messagesStore.messages().length;

    await this.messagesFacade.loadOlderMessages(
      this.userProfile,
      this.matchProfile
    );

    if (this.messagesStore.messages().length === previousMessageCount) {
      this.pendingScrollRestore = undefined;
    }
  }

  getProfileImage(profile?: PublicProfile) {
    const pictures = profile?.pictures ?? [];
    const primaryPicture = pictures.find(
      (picture) => picture.url === profile?.profilePicture
    );

    return (
      primaryPicture?.url ||
      profile?.profilePicture ||
      pictures[0]?.url ||
      this.fallbackAvatar
    );
  }

  getDisplayName(profile?: PublicProfile) {
    return profile?.firstName ?? '';
  }

  isOwnMessage(message: Message) {
    return !!this.userProfile?.uid && message.senderUid === this.userProfile.uid;
  }

  isReadReceiptVisible(message: Message) {
    return (
      this.hasReadReceiptsEnabled() &&
      this.isOwnMessage(message) &&
      message.isRead === true &&
      !message.isDeleted
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
    if (this.isCurrentMatchBlocked || !message.id || message.isDeleted) {
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
      !message.id ||
      message.isDeleted
    ) {
      return;
    }

    const reactionKey = `${message.id}:${emoji}`;

    if (this.pendingReactionKeys.has(reactionKey)) {
      return;
    }

    this.pendingReactionKeys.add(reactionKey);

    try {
      await this.messagesFacade.toggleMessageReaction(
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
    const nextMessage = `${currentMessage}${emoji}`;

    this.draftMessage = nextMessage;
    control?.setValue(nextMessage);
    this.onMessageInput();
    this.focusComposer();
  }

  async sendGif(gif: MessageGif, form: NgForm) {
    if (this.isCurrentMatchBlocked) {
      this.moderationNoticeKey = 'messages.blockedComposerNotice';
      return;
    }

    await this.sendComposedMessage('', 'gif', gif);
    this.draftMessage = '';
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

  isMatchBlocked(match?: PublicProfile) {
    return !!(
      this.userProfile?.blockedUsers?.length &&
      match?.uid &&
      this.userProfile.blockedUsers.includes(match.uid)
    );
  }

  getConversationPreview(match: PublicProfile) {
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

  isMatchOnline(match: PublicProfile) {
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

  selectMatch(match: PublicProfile) {
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
    this.messagesFacade.clearMessages();
    this.closeConversationMenu();
    this.matchRemoved.emit(removedMatch);
  }

  async reportUser() {
    if (!this.userProfile || !this.matchProfile) {
      return;
    }

    const reportReason = await this.selectReportReason();

    if (!reportReason) {
      this.closeConversationMenu();
      return;
    }

    await this.moderationStore.reportUser(
      this.userProfile,
      this.matchProfile,
      reportReason.reason,
      reportReason.description
    );
    this.moderationNoticeKey = 'messages.reportedNotice';
    this.closeConversationMenu();
  }

  canReportMessage(message: Message) {
    return !!(
      this.userProfile?.uid &&
      this.matchProfile?.uid &&
      message.id &&
      !message.isDeleted &&
      message.senderUid === this.matchProfile.uid &&
      message.sentToUid === this.userProfile.uid
    );
  }

  isMessageReportPending(message: Message) {
    return !!message.id && this.reportingMessageIds.has(message.id);
  }

  async reportMessage(message: Message) {
    if (!this.userProfile || !this.matchProfile || !this.canReportMessage(message)) {
      return;
    }

    const reportReason = await this.selectReportReason(
      'messages.reportMessageReasonTitle',
      'messages.reportMessageReasonText'
    );

    if (!reportReason || !message.id) {
      return;
    }

    this.reportingMessageIds.add(message.id);
    this.activeReactionPickerMessageId = undefined;

    try {
      await this.moderationStore.reportMessage(
        this.userProfile,
        this.matchProfile,
        message,
        reportReason.reason,
        reportReason.reasonLabel,
        reportReason.customDescription
      );
      this.moderationNoticeKey = 'messages.reportedMessageNotice';
    } finally {
      this.reportingMessageIds.delete(message.id);
    }
  }

  async onMessageSend(form: NgForm) {
    const messageText = String(
      this.draftMessage || form.value.message || ''
    ).trim();

    if (this.isCurrentMatchBlocked) {
      this.moderationNoticeKey = 'messages.blockedComposerNotice';
      return;
    }

    if (!messageText) {
      return;
    }

    await this.sendComposedMessage(messageText, 'text');
    this.draftMessage = '';
    form.resetForm({ message: '' });
    this.activeComposerPanel = null;
    this.clearLocalTypingStatus();
    this.pendingScrollToBottom = true;
  }

  shouldShowIcebreakers() {
    return !!(
      this.matchProfile?.uid &&
      !this.isCurrentMatchBlocked &&
      !this.messagesStore.loading() &&
      this.messagesStore.messages().length === 0
    );
  }

  getIcebreakerPrompts() {
    const sharedInterest = this.getSharedConversationInterest();
    const place = this.getMatchPlace();
    const name = this.matchProfile?.firstName || this.getDisplayName(this.matchProfile);
    const prompts = [
      {
        styleKey: 'kind',
        text: this.transloco.translate('messages.icebreakers.kind', { name }),
      },
      {
        styleKey: 'curious',
        text: sharedInterest
          ? this.transloco.translate('messages.icebreakers.sharedInterest', {
              interest: sharedInterest,
            })
          : this.transloco.translate('messages.icebreakers.curiousFallback'),
      },
      {
        styleKey: 'playful',
        text: place
          ? this.transloco.translate('messages.icebreakers.playfulPlace', {
              place,
            })
          : this.transloco.translate('messages.icebreakers.playful'),
      },
      {
        styleKey: 'short',
        text: this.transloco.translate('messages.icebreakers.short'),
      },
    ];
    const seenPrompts = new Set<string>();

    return prompts
      .filter((prompt) => {
        if (!prompt.text || seenPrompts.has(prompt.text)) {
          return false;
        }

        seenPrompts.add(prompt.text);
        return true;
      })
      .slice(0, 4);
  }

  selectIcebreakerPrompt(prompt: string) {
    if (this.isCurrentMatchBlocked) {
      return;
    }

    this.draftMessage = prompt;
    this.activeComposerPanel = null;
    this.activeReactionPickerMessageId = undefined;
    this.focusComposer();
  }

  private getSharedConversationInterest() {
    const userInterests = new Set([
      ...(this.userProfile?.interests ?? []),
      ...(this.userProfile?.freeTimeAct ?? []),
    ]);
    const matchInterests = [
      ...(this.matchProfile?.interests ?? []),
      ...(this.matchProfile?.freeTimeAct ?? []),
    ];
    const sharedInterest = matchInterests.find((interest) =>
      userInterests.has(interest)
    );

    return sharedInterest
      ? translatedProfileValue(
          (key) => this.transloco.translate(key),
          sharedInterest
        )
      : '';
  }

  private getMatchPlace() {
    return String(
      this.matchProfile?.currentPlace || this.userProfile?.currentPlace || ''
    ).trim();
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

    const sentMessage = await this.messagesFacade.sendMessage(
      this.userProfile,
      this.matchProfile,
      message
    );

    if (sentMessage) {
      this.messageSent.emit({
        matchProfile: this.matchProfile,
        message: sentMessage,
      });
    }
  }

  isMessageSending(message: Message) {
    return message.deliveryStatus === 'sending';
  }

  isMessageFailed(message: Message) {
    return message.deliveryStatus === 'failed';
  }

  isEditingMessage(message: Message) {
    return !!message.id && this.editingMessageId === message.id;
  }

  isMessageActionPending(message: Message) {
    return !!message.id && this.pendingMessageActionIds.has(message.id);
  }

  canEditMessage(message: Message) {
    return !!(
      this.isOwnMessage(message) &&
      message.id &&
      !message.isDeleted &&
      message.messageType === 'text' &&
      !this.isMessageSending(message) &&
      !this.isMessageFailed(message)
    );
  }

  canDeleteMessage(message: Message) {
    return !!(
      this.isOwnMessage(message) &&
      message.id &&
      !message.isDeleted &&
      !this.isMessageSending(message) &&
      !this.isMessageFailed(message)
    );
  }

  startEditMessage(message: Message) {
    if (!this.canEditMessage(message)) {
      return;
    }

    this.editingMessageId = message.id;
    this.editingMessageText = message.message;
    this.activeReactionPickerMessageId = undefined;
  }

  cancelEditMessage() {
    this.editingMessageId = undefined;
    this.editingMessageText = '';
  }

  async saveEditedMessage(message: Message) {
    if (
      !this.userProfile ||
      !this.matchProfile ||
      !message.id ||
      !this.canEditMessage(message)
    ) {
      return;
    }

    const nextText = this.editingMessageText.trim();

    if (!nextText || nextText === message.message) {
      this.cancelEditMessage();
      return;
    }

    this.pendingMessageActionIds.add(message.id);

    try {
      const saved = await this.messagesFacade.editMessage(
        this.userProfile,
        this.matchProfile,
        message,
        nextText
      );

      if (saved) {
        this.cancelEditMessage();
      }
    } finally {
      this.pendingMessageActionIds.delete(message.id);
    }
  }

  async deleteMessage(message: Message) {
    if (
      !this.userProfile ||
      !this.matchProfile ||
      !message.id ||
      !this.canDeleteMessage(message)
    ) {
      return;
    }

    const confirmed = await this.confirmDeleteMessage();

    if (!confirmed) {
      return;
    }

    this.pendingMessageActionIds.add(message.id);

    try {
      await this.messagesFacade.deleteMessage(
        this.userProfile,
        this.matchProfile,
        message
      );
    } finally {
      this.pendingMessageActionIds.delete(message.id);
    }
  }

  async retryMessage(message: Message) {
    if (
      !this.userProfile ||
      !this.matchProfile ||
      !this.isOwnMessage(message) ||
      !this.isMessageFailed(message)
    ) {
      return;
    }

    const sentMessage = await this.messagesFacade.retryMessage(
      this.userProfile,
      this.matchProfile,
      message
    );

    if (sentMessage) {
      this.messageSent.emit({
        matchProfile: this.matchProfile,
        message: sentMessage,
      });
    }
  }

  onMessageInput() {
    if (this.isCurrentMatchBlocked || !this.userProfile || !this.matchProfile) {
      return;
    }

    const now = Date.now();

    if (now - this.lastTypingWriteAt > 2500) {
      this.lastTypingWriteAt = now;
      void this.messagesFacade.setTypingStatus(
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

  onComposerFocus() {
    this.activeReactionPickerMessageId = undefined;
    this.syncMobileViewportMetrics();
    this.scheduleThreadScrollToBottom();
  }

  onComposerBlur() {
    window.setTimeout(() => {
      this.syncMobileViewportMetrics();
    }, 180);
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

  private scheduleThreadScrollToBottom() {
    this.pendingScrollToBottom = true;
    this.document.defaultView?.requestAnimationFrame(() => {
      this.scrollThreadToBottom();
    });
  }

  private restoreThreadScrollPosition() {
    const previousPosition = this.pendingScrollRestore;
    this.pendingScrollRestore = undefined;

    if (!previousPosition) {
      return;
    }

    queueMicrotask(() => {
      const element = this.messageThread?.nativeElement;

      if (!element) {
        return;
      }

      const heightDelta = element.scrollHeight - previousPosition.scrollHeight;
      element.scrollTop = previousPosition.scrollTop + heightDelta;
    });
  }

  private isThreadNearBottom() {
    const element = this.messageThread?.nativeElement;

    if (!element) {
      return true;
    }

    return (
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
    );
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

    void this.messagesFacade.setTypingStatus(
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
    const isMobileMessageView = !!(
      isMobileMessagesTab && this.options?.isSelectedMatch
    );

    this.document.body.classList.toggle(
      'is-mobile-messages-tab',
      isMobileMessagesTab
    );
    this.document.body.classList.toggle(
      'is-mobile-message-view',
      isMobileMessageView
    );
    this.syncMobileViewportMetrics();
  }

  private setupMobileViewportListeners() {
    const win = this.document.defaultView;

    if (!win) {
      return;
    }

    this.visualViewport = win.visualViewport ?? undefined;

    win.addEventListener('resize', this.mobileViewportResizeHandler, {
      passive: true,
    });
    win.addEventListener('orientationchange', this.mobileViewportResizeHandler, {
      passive: true,
    });
    this.visualViewport?.addEventListener(
      'resize',
      this.mobileViewportResizeHandler,
      { passive: true }
    );
    this.visualViewport?.addEventListener(
      'scroll',
      this.mobileViewportResizeHandler,
      { passive: true }
    );
  }

  private removeMobileViewportListeners() {
    const win = this.document.defaultView;

    win?.removeEventListener('resize', this.mobileViewportResizeHandler);
    win?.removeEventListener(
      'orientationchange',
      this.mobileViewportResizeHandler
    );
    this.visualViewport?.removeEventListener(
      'resize',
      this.mobileViewportResizeHandler
    );
    this.visualViewport?.removeEventListener(
      'scroll',
      this.mobileViewportResizeHandler
    );
  }

  private async setupNativeKeyboardListeners() {
    if (
      !Capacitor.isNativePlatform() ||
      !Capacitor.isPluginAvailable('Keyboard')
    ) {
      return;
    }

    const onKeyboardShown = (info: KeyboardInfo) => {
      this.keyboardHeight = info.keyboardHeight;
      this.syncMobileViewportMetrics();
      this.scheduleThreadScrollToBottom();
    };
    const onKeyboardHidden = () => {
      this.keyboardHeight = 0;
      this.syncMobileViewportMetrics();
      this.scheduleThreadScrollToBottom();
    };

    this.keyboardListenerHandles = await Promise.all([
      Keyboard.addListener('keyboardWillShow', onKeyboardShown),
      Keyboard.addListener('keyboardDidShow', onKeyboardShown),
      Keyboard.addListener('keyboardWillHide', onKeyboardHidden),
      Keyboard.addListener('keyboardDidHide', onKeyboardHidden),
    ]);
  }

  private removeNativeKeyboardListeners() {
    for (const handle of this.keyboardListenerHandles) {
      void handle.remove();
    }

    this.keyboardListenerHandles = [];
  }

  private syncMobileViewportMetrics() {
    const win = this.document.defaultView;

    if (!win) {
      return;
    }

    const isMobileMessageView = !!(
      this.options?.phoneView && this.options?.isSelectedMatch
    );

    if (!isMobileMessageView) {
      this.clearMobileViewportMetrics();
      return;
    }

    const viewport = win.visualViewport;
    const innerHeight = win.innerHeight || viewport?.height || 0;
    const visualViewportHeight = viewport?.height ?? innerHeight;
    const viewportKeyboardHeight = Math.max(
      0,
      innerHeight - visualViewportHeight - (viewport?.offsetTop ?? 0)
    );
    const shouldUseNativeKeyboardHeight =
      this.keyboardHeight > 0 && viewportKeyboardHeight < 80;
    const availableHeight = shouldUseNativeKeyboardHeight
      ? innerHeight - this.keyboardHeight
      : visualViewportHeight;
    const safeHeight = Math.max(320, Math.round(availableHeight));
    const isKeyboardOpen =
      this.keyboardHeight > 0 || viewportKeyboardHeight > 80;

    this.document.documentElement.style.setProperty(
      '--amor-mobile-message-viewport-height',
      `${safeHeight}px`
    );
    this.document.body.classList.toggle(
      'is-mobile-keyboard-open',
      isKeyboardOpen
    );
  }

  private clearMobileViewportMetrics() {
    this.document.documentElement.style.removeProperty(
      '--amor-mobile-message-viewport-height'
    );
    this.document.body.classList.remove('is-mobile-keyboard-open');
  }

  private async confirmRemoveMatch(match: PublicProfile) {
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

  private async confirmDeleteMessage() {
    let confirmed = false;
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('messages.deleteMessageConfirmTitle'),
      message: this.transloco.translate('messages.deleteMessageConfirmText'),
      cssClass: 'premium-moderation-alert remove-match-alert',
      buttons: [
        {
          text: this.transloco.translate('common.cancel'),
          role: 'cancel',
          cssClass: 'premium-alert-cancel-button',
        },
        {
          text: this.transloco.translate('messages.deleteMessageConfirmButton'),
          role: 'destructive',
          cssClass: 'premium-alert-danger-button',
          handler: () => {
            confirmed = true;
          },
        },
      ],
    });

    await alert.present();
    await alert.onDidDismiss();

    return confirmed;
  }

  private async selectReportReason(
    titleKey = 'messages.reportReasonTitle',
    textKey = 'messages.reportReasonText'
  ) {
    this.closeConversationMenu();
    this.resolveReportDialog(undefined);
    this.reportDialogTitleKey = titleKey;
    this.reportDialogTextKey = textKey;
    this.reportDialogSelectedReason = 'fakeProfile';
    this.reportDialogOtherDescription = '';
    this.isReportDialogOpen = true;

    return new Promise<ReportReasonSelection | undefined>((resolve) => {
      this.reportDialogResolver = resolve;
    });
  }

  selectReportDialogReason(reason: ReportReason) {
    this.reportDialogSelectedReason = reason;

    if (reason === 'other') {
      queueMicrotask(() => this.reportOtherTextarea?.nativeElement.focus());
    }
  }

  isReportDialogOtherSelected() {
    return this.reportDialogSelectedReason === 'other';
  }

  isReportDialogSubmitDisabled() {
    return (
      this.isReportDialogOtherSelected() &&
      this.reportDialogOtherDescription.trim().length < 3
    );
  }

  cancelReportDialog() {
    this.resolveReportDialog(undefined);
  }

  confirmReportDialog() {
    if (this.isReportDialogSubmitDisabled()) {
      return;
    }

    const reason = this.reportDialogSelectedReason;
    const reasonLabel = this.transloco.translate(
      `messages.reportReasons.${reason}`
    );
    const customDescription = this.reportDialogOtherDescription.trim();
    const description =
      reason === 'other' && customDescription
        ? `${reasonLabel}: ${customDescription}`
        : reasonLabel;

    this.resolveReportDialog({
      customDescription: customDescription || undefined,
      description,
      reason,
      reasonLabel,
    });
  }

  private resolveReportDialog(selection?: ReportReasonSelection) {
    const resolve = this.reportDialogResolver;

    this.reportDialogResolver = undefined;
    this.isReportDialogOpen = false;
    this.reportDialogOtherDescription = '';
    this.reportDialogSelectedReason = 'fakeProfile';

    resolve?.(selection);
  }

}
