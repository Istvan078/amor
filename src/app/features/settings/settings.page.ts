import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonToggle,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowBackOutline,
  cardOutline,
  chatbubbleEllipsesOutline,
  chevronForwardOutline,
  checkmarkCircleOutline,
  diamondOutline,
  eyeOutline,
  heartOutline,
  languageOutline,
  locationOutline,
  lockClosedOutline,
  mailOutline,
  megaphoneOutline,
  notificationsOutline,
  personCircleOutline,
  radioButtonOnOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  starOutline,
} from 'ionicons/icons';

import { LanguageSwitcherComponent } from '../../shared/ui/language-switcher/language-switcher.component';
import { NotificationPreferences, UserClass } from '../../shared/models/user.model';
import { AuthStore } from '../auth/store/auth.store';
import { ProfileStore } from '../profile/store/profile.store';

type VisibilitySettingKey =
  | 'isVisible'
  | 'showOnlineStatus'
  | 'distanceVisibility';

type NotificationSettingKey = keyof NotificationPreferences;

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

  savingSetting: VisibilitySettingKey | null = null;
  savingNotificationSetting: NotificationSettingKey | null = null;
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
      eyeOutline,
      heartOutline,
      languageOutline,
      locationOutline,
      lockClosedOutline,
      mailOutline,
      megaphoneOutline,
      notificationsOutline,
      personCircleOutline,
      radioButtonOnOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      starOutline,
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
    return this.savingNotificationSetting === key;
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

    this.savingNotificationSetting = key;
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
}
