import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonIcon,
  IonToggle,
} from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowBackOutline,
  cardOutline,
  chatbubbleEllipsesOutline,
  chevronForwardOutline,
  checkmarkCircleOutline,
  diamondOutline,
  exitOutline,
  eyeOutline,
  heartOutline,
  languageOutline,
  locationOutline,
  lockClosedOutline,
  mailOutline,
  megaphoneOutline,
  moonOutline,
  notificationsOutline,
  personCircleOutline,
  phonePortraitOutline,
  radioButtonOnOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  starOutline,
  trashOutline,
} from 'ionicons/icons';

import { LanguageSwitcherComponent } from '../../shared/ui/language-switcher/language-switcher.component';
import {
  NotificationDeliveryPreferences,
  NotificationPreferences,
  NotificationQuietHours,
  UserClass,
} from '../../shared/models/user.model';
import { AuthStore } from '../auth/store/auth.store';
import { DiscoverStore } from '../discover/store/discover.store';
import { DiscoverUiStore } from '../discover/store/discover-ui.store';
import { OnlinePresenceService } from '../presence/data-access/online-presence.service';
import { ProfileStore } from '../profile/store/profile.store';
import { DailyUsageStore } from '../usage/store/daily-usage.store';

type VisibilitySettingKey =
  | 'isVisible'
  | 'showOnlineStatus'
  | 'distanceVisibility';

type NotificationSettingKey = keyof NotificationPreferences;
type NotificationDeliveryKey = keyof NotificationDeliveryPreferences;
type NotificationSaveKey =
  | `preference:${NotificationSettingKey}`
  | `delivery:${NotificationDeliveryKey}`
  | 'quiet-hours-enabled'
  | 'quiet-hours-start'
  | 'quiet-hours-end';

@Component({
  selector: 'app-settings-page',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    TranslocoDirective,
    IonButton,
    IonContent,
    IonIcon,
    IonToggle,
    LanguageSwitcherComponent,
  ],
})
export class SettingsPage implements OnInit {
  readonly profileStore = inject(ProfileStore);
  private authStore = inject(AuthStore);
  private discoverStore = inject(DiscoverStore);
  private discoverUiStore = inject(DiscoverUiStore);
  private dailyUsageStore = inject(DailyUsageStore);
  private onlinePresenceService = inject(OnlinePresenceService);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);
  private transloco = inject(TranslocoService);

  readonly visibilitySettings: Array<{
    key: VisibilitySettingKey;
    icon: string;
    titleKey: string;
    copyKey: string;
    enabledKey: string;
    disabledKey: string;
  }> = [
    {
      key: 'isVisible',
      icon: 'eye-outline',
      titleKey: 'settings.visibility.profile.title',
      copyKey: 'settings.visibility.profile.copy',
      enabledKey: 'settings.visibility.profile.enabled',
      disabledKey: 'settings.visibility.profile.disabled',
    },
    {
      key: 'showOnlineStatus',
      icon: 'radio-button-on-outline',
      titleKey: 'settings.visibility.online.title',
      copyKey: 'settings.visibility.online.copy',
      enabledKey: 'settings.visibility.online.enabled',
      disabledKey: 'settings.visibility.online.disabled',
    },
    {
      key: 'distanceVisibility',
      icon: 'location-outline',
      titleKey: 'settings.visibility.distance.title',
      copyKey: 'settings.visibility.distance.copy',
      enabledKey: 'settings.visibility.distance.enabled',
      disabledKey: 'settings.visibility.distance.disabled',
    },
  ];

  readonly notificationSettings: Array<{
    key: NotificationSettingKey;
    icon: string;
    titleKey: string;
    copyKey: string;
    enabledKey: string;
    disabledKey: string;
  }> = [
    {
      key: 'newMatches',
      icon: 'heart-outline',
      titleKey: 'settings.notifications.preferences.newMatches.title',
      copyKey: 'settings.notifications.preferences.newMatches.copy',
      enabledKey: 'settings.notifications.preferences.newMatches.enabled',
      disabledKey: 'settings.notifications.preferences.newMatches.disabled',
    },
    {
      key: 'newMessages',
      icon: 'chatbubble-ellipses-outline',
      titleKey: 'settings.notifications.preferences.newMessages.title',
      copyKey: 'settings.notifications.preferences.newMessages.copy',
      enabledKey: 'settings.notifications.preferences.newMessages.enabled',
      disabledKey: 'settings.notifications.preferences.newMessages.disabled',
    },
    {
      key: 'superLikes',
      icon: 'star-outline',
      titleKey: 'settings.notifications.preferences.superLikes.title',
      copyKey: 'settings.notifications.preferences.superLikes.copy',
      enabledKey: 'settings.notifications.preferences.superLikes.enabled',
      disabledKey: 'settings.notifications.preferences.superLikes.disabled',
    },
    {
      key: 'promotions',
      icon: 'megaphone-outline',
      titleKey: 'settings.notifications.preferences.promotions.title',
      copyKey: 'settings.notifications.preferences.promotions.copy',
      enabledKey: 'settings.notifications.preferences.promotions.enabled',
      disabledKey: 'settings.notifications.preferences.promotions.disabled',
    },
  ];

  readonly notificationDeliverySettings: Array<{
    key: NotificationDeliveryKey;
    icon: string;
    titleKey: string;
    copyKey: string;
    enabledKey: string;
    disabledKey: string;
  }> = [
    {
      key: 'inApp',
      icon: 'notifications-outline',
      titleKey: 'settings.notifications.delivery.inApp.title',
      copyKey: 'settings.notifications.delivery.inApp.copy',
      enabledKey: 'settings.notifications.delivery.inApp.enabled',
      disabledKey: 'settings.notifications.delivery.inApp.disabled',
    },
    {
      key: 'push',
      icon: 'phone-portrait-outline',
      titleKey: 'settings.notifications.delivery.push.title',
      copyKey: 'settings.notifications.delivery.push.copy',
      enabledKey: 'settings.notifications.delivery.push.enabled',
      disabledKey: 'settings.notifications.delivery.push.disabled',
    },
  ];

  private readonly quietHoursDefaults: Required<NotificationQuietHours> = {
    enabled: false,
    start: '22:00',
    end: '07:00',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };

  savingSetting: VisibilitySettingKey | null = null;
  savingNotificationSetting: NotificationSaveKey | null = null;
  settingsNoticeKey?: string;
  notificationNoticeKey?: string;

  constructor() {
    addIcons({
      alertCircleOutline,
      arrowBackOutline,
      cardOutline,
      chatbubbleEllipsesOutline,
      chevronForwardOutline,
      checkmarkCircleOutline,
      diamondOutline,
      exitOutline,
      eyeOutline,
      heartOutline,
      languageOutline,
      locationOutline,
      lockClosedOutline,
      mailOutline,
      megaphoneOutline,
      moonOutline,
      notificationsOutline,
      personCircleOutline,
      phonePortraitOutline,
      radioButtonOnOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      starOutline,
      trashOutline,
    });
  }

  async ngOnInit() {
    await this.authStore.waitForAuthReady();

    const uid = this.authStore.uid();

    if (uid && !this.profileStore.profile()) {
      await this.profileStore.loadProfile(uid);
    }
  }

  isSettingEnabled(key: VisibilitySettingKey) {
    return this.profileStore.profile()?.[key] !== false;
  }

  isSettingSaving(key: VisibilitySettingKey) {
    return this.savingSetting === key;
  }

  getSettingStatusKey(setting: {
    key: VisibilitySettingKey;
    enabledKey: string;
    disabledKey: string;
  }) {
    return this.isSettingEnabled(setting.key)
      ? setting.enabledKey
      : setting.disabledKey;
  }

  isNotificationSettingEnabled(key: NotificationSettingKey) {
    return this.profileStore.profile()?.notificationPreferences?.[key] !== false;
  }

  isNotificationSettingSaving(key: NotificationSettingKey) {
    return this.savingNotificationSetting === `preference:${key}`;
  }

  getNotificationStatusKey(setting: {
    key: NotificationSettingKey;
    enabledKey: string;
    disabledKey: string;
  }) {
    return this.isNotificationSettingEnabled(setting.key)
      ? setting.enabledKey
      : setting.disabledKey;
  }

  isNotificationDeliveryEnabled(key: NotificationDeliveryKey) {
    return this.profileStore.profile()?.notificationDelivery?.[key] !== false;
  }

  isNotificationDeliverySaving(key: NotificationDeliveryKey) {
    return this.savingNotificationSetting === `delivery:${key}`;
  }

  getNotificationDeliveryStatusKey(setting: {
    key: NotificationDeliveryKey;
    enabledKey: string;
    disabledKey: string;
  }) {
    return this.isNotificationDeliveryEnabled(setting.key)
      ? setting.enabledKey
      : setting.disabledKey;
  }

  getQuietHours() {
    return {
      ...this.quietHoursDefaults,
      ...(this.profileStore.profile()?.notificationQuietHours ?? {}),
    };
  }

  isQuietHoursEnabled() {
    return this.getQuietHours().enabled === true;
  }

  quietHoursStart() {
    return this.getQuietHours().start;
  }

  quietHoursEnd() {
    return this.getQuietHours().end;
  }

  quietHoursTimeZone() {
    return this.getQuietHours().timeZone;
  }

  isQuietHoursSaving(key?: 'enabled' | 'start' | 'end') {
    if (!key) {
      return this.savingNotificationSetting?.startsWith('quiet-hours') === true;
    }

    return this.savingNotificationSetting === `quiet-hours-${key}`;
  }

  async updateVisibilitySetting(key: VisibilitySettingKey, event: Event) {
    const checked =
      (event as CustomEvent<{ checked: boolean }>).detail?.checked === true;
    const uid = this.profileStore.uid() ?? this.authStore.uid();

    if (!uid || this.savingSetting) {
      return;
    }

    this.savingSetting = key;
    this.settingsNoticeKey = undefined;

    const saved = await this.profileStore.updateProfile(uid, {
      [key]: checked,
    } as Partial<UserClass>);

    this.savingSetting = null;
    this.settingsNoticeKey = saved
      ? 'settings.visibility.saved'
      : 'settings.visibility.error';
  }

  async updateNotificationSetting(key: NotificationSettingKey, event: Event) {
    const checked =
      (event as CustomEvent<{ checked: boolean }>).detail?.checked === true;
    const uid = this.profileStore.uid() ?? this.authStore.uid();
    const profile = this.profileStore.profile();

    if (!uid || !profile || this.savingNotificationSetting) {
      return;
    }

    this.savingNotificationSetting = `preference:${key}`;
    this.notificationNoticeKey = undefined;

    const notificationPreferences = {
      ...(profile.notificationPreferences ?? {}),
      [key]: checked,
    };

    const saved = await this.profileStore.updateProfile(uid, {
      notificationPreferences,
    } as Partial<UserClass>);

    this.savingNotificationSetting = null;
    this.notificationNoticeKey = saved
      ? 'settings.notifications.saved'
      : 'settings.notifications.error';
  }

  async updateNotificationDeliverySetting(
    key: NotificationDeliveryKey,
    event: Event
  ) {
    const checked =
      (event as CustomEvent<{ checked: boolean }>).detail?.checked === true;
    const profile = this.profileStore.profile();

    if (!profile) {
      return;
    }

    await this.saveNotificationUpdate(`delivery:${key}`, {
      notificationDelivery: {
        ...(profile.notificationDelivery ?? {}),
        [key]: checked,
      },
    });
  }

  async updateQuietHoursEnabled(event: Event) {
    const checked =
      (event as CustomEvent<{ checked: boolean }>).detail?.checked === true;

    await this.saveQuietHours(
      {
        ...this.getQuietHours(),
        enabled: checked,
      },
      'quiet-hours-enabled'
    );
  }

  async updateQuietHoursTime(key: 'start' | 'end', event: Event) {
    const value = ((event.target as HTMLInputElement | null)?.value ?? '').trim();

    if (!this.isValidQuietHoursTime(value)) {
      return;
    }

    await this.saveQuietHours(
      {
        ...this.getQuietHours(),
        [key]: value,
      },
      `quiet-hours-${key}`
    );
  }

  async signOutAlert() {
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('auth.signOut.title'),
      message: this.transloco.translate('auth.signOut.message'),
      cssClass: 'signout-alert',
      buttons: [
        {
          text: this.transloco.translate('auth.signOut.confirm'),
          role: 'confirm',
          handler: () => {
            void this.signOut();
          },
          cssClass: 'signout-alert-button',
        },
        {
          text: this.transloco.translate('common.cancel'),
          role: 'cancel',
          cssClass: 'signout-alert-cancel-button',
        },
      ],
    });

    await alert.present();
  }

  async confirmDeleteProfile() {
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('profile.deleteConfirm.title'),
      message: this.transloco.translate('profile.deleteConfirm.message'),
      cssClass: 'delete-profile-alert',
      buttons: [
        {
          text: this.transloco.translate('common.cancel'),
          role: 'cancel',
          cssClass: 'delete-profile-alert-cancel-button',
        },
        {
          text: this.transloco.translate('profile.deleteConfirm.confirm'),
          role: 'destructive',
          handler: () => {
            void this.deleteProfile();
          },
          cssClass: 'delete-profile-alert-confirm-button',
        },
      ],
    });

    await alert.present();
  }

  private async deleteProfile() {
    const uid = this.profileStore.uid() ?? this.authStore.uid();

    if (!uid) {
      return;
    }

    await this.onlinePresenceService.setOffline(uid);
    const wasDeleted = await this.profileStore.deleteOwnProfile();

    if (!wasDeleted) {
      return;
    }

    this.authStore.setAutoFillEmail(undefined);
    this.authStore.clearUsers();
    this.discoverStore.clearDiscoverData();
    this.discoverUiStore.reset();
    this.dailyUsageStore.clearDailyUsage();
    await this.router.navigate(['/amor/register'], { replaceUrl: true });
  }

  private async signOut() {
    const autoFillEmail = this.profileStore.profile()?.email;

    await this.onlinePresenceService.setOffline(this.authStore.uid());
    await this.authStore.signOut();
    this.authStore.setAutoFillEmail(autoFillEmail);
    this.profileStore.clearProfile();
    this.discoverStore.clearDiscoverData();
    this.discoverUiStore.reset();
    this.dailyUsageStore.clearDailyUsage();
    await this.router.navigate(['/amor/login'], { replaceUrl: true });
  }

  private async saveQuietHours(
    quietHours: NotificationQuietHours,
    savingKey: NotificationSaveKey
  ) {
    await this.saveNotificationUpdate(savingKey, {
      notificationQuietHours: quietHours,
    });
  }

  private async saveNotificationUpdate(
    savingKey: NotificationSaveKey,
    update: Partial<UserClass>
  ) {
    const uid = this.profileStore.uid() ?? this.authStore.uid();

    if (!uid || this.savingNotificationSetting) {
      return;
    }

    this.savingNotificationSetting = savingKey;
    this.notificationNoticeKey = undefined;

    const saved = await this.profileStore.updateProfile(uid, update);

    this.savingNotificationSetting = null;
    this.notificationNoticeKey = saved
      ? 'settings.notifications.saved'
      : 'settings.notifications.error';
  }

  private isValidQuietHoursTime(value: string) {
    return /^\d{2}:\d{2}$/.test(value);
  }
}
