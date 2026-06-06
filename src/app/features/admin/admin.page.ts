import { FormsModule } from '@angular/forms';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertController, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  banOutline,
  barChartOutline,
  cardOutline,
  chatbubblesOutline,
  checkmarkDoneOutline,
  closeCircleOutline,
  eyeOutline,
  eyeOffOutline,
  flagOutline,
  notificationsOutline,
  peopleOutline,
  radioButtonOnOutline,
  shieldCheckmarkOutline,
  timeOutline,
  trashOutline,
  warningOutline,
} from 'ionicons/icons';

import {
  AdminAuditLogEntry,
  AdminBillingSnapshot,
  AdminConversation,
  AdminConversationSummary,
  AdminReport,
  AdminRepository,
  AdminUser,
} from './data-access/admin.repository';
import { ModerationReportStatus } from '../moderation/models/moderation.model';

type AdminPanel =
  | 'reports'
  | 'users'
  | 'conversations'
  | 'billing'
  | 'audit'
  | 'analytics';
type ReportStatusFilter = ModerationReportStatus | 'all';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: true,
  imports: [FormsModule, IonIcon, RouterLink],
})
export class AdminPage implements OnInit {
  readonly activePanel = signal<AdminPanel>('reports');
  readonly reports = signal<AdminReport[]>([]);
  readonly users = signal<AdminUser[]>([]);
  readonly selectedReport = signal<AdminReport | null>(null);
  readonly selectedUser = signal<AdminUser | null>(null);
  readonly selectedBilling = signal<AdminBillingSnapshot | null>(null);
  readonly selectedConversation = signal<AdminConversation | null>(null);
  readonly conversations = signal<AdminConversationSummary[]>([]);
  readonly auditLog = signal<AdminAuditLogEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly userSearch = signal('');
  readonly reportStatusFilter = signal<ReportStatusFilter>('open');

  readonly openReports = computed(
    () => this.reports().filter((report) => report.status === 'open').length
  );
  readonly premiumUsers = computed(
    () => this.users().filter((user) => user.isPremium).length
  );
  readonly bannedUsers = computed(
    () => this.users().filter((user) => user.isBanned).length
  );
  readonly hiddenProfiles = computed(
    () =>
      this.users().filter(
        (user) => user.isShadowBanned || user.isVisible === false
      ).length
  );
  readonly selectedReporter = computed(() => {
    const report = this.selectedReport();

    return report ? this.findUser(report.reporterUid) : null;
  });
  readonly selectedReportedUser = computed(() => {
    const report = this.selectedReport();

    return report ? this.findUser(report.reportedUid) : null;
  });
  readonly selectedReportConversationSummary = computed(() => {
    const report = this.selectedReport();

    if (!report?.reporterUid || !report.reportedUid) {
      return null;
    }

    const conversationId = this.getConversationId(
      report.reporterUid,
      report.reportedUid
    );

    return (
      this.conversations().find(
        (conversation) => conversation.id === conversationId
      ) ?? null
    );
  });
  readonly reportReasonAnalytics = computed(() => {
    const counts = new Map<string, number>();

    this.reports().forEach((report) => {
      counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  });
  readonly moderationAnalytics = computed(() => {
    const reports = this.reports();
    const users = this.users();

    return {
      reviewedReports: reports.filter((report) => report.status === 'reviewed').length,
      dismissedReports: reports.filter((report) => report.status === 'dismissed').length,
      actionTakenReports: reports.filter((report) => report.status === 'action_taken').length,
      warningCount: users.reduce((total, user) => total + user.warningCount, 0),
      reportedConversationCount: this.conversations().length,
      auditEvents: this.auditLog().length,
    };
  });
  readonly filteredReports = computed(() => {
    const status = this.reportStatusFilter();

    if (status === 'all') {
      return this.reports();
    }

    return this.reports().filter((report) => report.status === status);
  });
  readonly filteredUsers = computed(() => {
    const search = this.userSearch().trim().toLowerCase();

    if (!search) {
      return this.users();
    }

    return this.users().filter((user) =>
      [user.uid, user.email, user.displayName]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  });

  private adminRepository = inject(AdminRepository);
  private alertCtrl = inject(AlertController);

  constructor() {
    addIcons({
      banOutline,
      barChartOutline,
      cardOutline,
      chatbubblesOutline,
      checkmarkDoneOutline,
      closeCircleOutline,
      eyeOutline,
      eyeOffOutline,
      flagOutline,
      notificationsOutline,
      peopleOutline,
      radioButtonOnOutline,
      shieldCheckmarkOutline,
      timeOutline,
      trashOutline,
      warningOutline,
    });
  }

  async ngOnInit() {
    await this.loadDashboard();
  }

  async loadDashboard() {
    this.loading.set(true);
    this.error.set(null);

    try {
      const previousSelectedReportId = this.selectedReport()?.id;
      const previousSelectedConversationId = this.selectedConversation()?.id;
      const reports = await this.adminRepository.loadReports();
      const [users, conversations, auditLog] = await Promise.all([
        this.adminRepository.loadUsers(reports),
        this.adminRepository.loadReportedConversationSummaries(reports),
        this.adminRepository.loadAuditLog().catch((auditError) => {
          console.warn('Audit log could not be loaded.', auditError);

          return [];
        }),
      ]);

      this.reports.set(reports);
      this.users.set(users);
      this.conversations.set(conversations);
      this.auditLog.set(auditLog);
      this.selectedReport.set(
        reports.find((report) => report.id === previousSelectedReportId) ??
        reports[0] ??
        null
      );
      this.selectedUser.set(users[0] ?? null);

      if (previousSelectedConversationId) {
        this.selectedConversation.set(
          conversations.some(
            (conversation) => conversation.id === previousSelectedConversationId
          )
            ? await this.adminRepository.loadConversation(
              previousSelectedConversationId
            )
            : null
        );
      }

      if (users[0]) {
        this.selectedBilling.set(
          await this.adminRepository.loadBilling(users[0].uid)
        );
      }
    } catch (error) {
      console.error(error);
      this.error.set('Admin data could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  setPanel(panel: AdminPanel) {
    this.activePanel.set(panel);
  }

  setReportStatusFilter(status: ReportStatusFilter) {
    this.reportStatusFilter.set(status);

    const selected = this.selectedReport();
    if (
      selected &&
      status !== 'all' &&
      selected.status !== status
    ) {
      this.selectedReport.set(this.filteredReports()[0] ?? null);
    }
  }

  async selectReport(report: AdminReport) {
    this.selectedReport.set(report);
    this.selectedConversation.set(null);
  }

  async markReviewed(report: AdminReport) {
    await this.adminRepository.updateReportStatus(report, 'reviewed');
    await this.loadDashboard();
  }

  async dismiss(report: AdminReport) {
    await this.adminRepository.updateReportStatus(report, 'dismissed');
    await this.loadDashboard();
  }

  async blockReportedUser(report: AdminReport) {
    const confirmed = await this.confirmAdminAction(
      'Block reported user?',
      'This will add the reported user to the reporter blocked list and mark the report as action taken.',
      'Block user'
    );

    if (!confirmed) {
      return;
    }

    await this.adminRepository.blockReportedUser(report);
    await this.loadDashboard();
  }

  async removeMatch(report: AdminReport) {
    const confirmed = await this.confirmAdminAction(
      'Remove match?',
      'This removes the match for both users and marks the report as action taken.',
      'Remove match'
    );

    if (!confirmed) {
      return;
    }

    await this.adminRepository.removeMatchForReport(report);
    await this.loadDashboard();
  }

  async toggleReportedUserBan(report: AdminReport) {
    const reportedUser = this.findUser(report.reportedUid);
    const shouldBan = !reportedUser?.isBanned;
    const confirmed = await this.confirmAdminAction(
      shouldBan ? 'Ban reported user?' : 'Unban reported user?',
      shouldBan
        ? 'This removes the profile from discovery and marks the account as banned.'
        : 'This removes the banned flag and allows the profile to be restored by moderation.',
      shouldBan ? 'Ban user' : 'Unban user'
    );

    if (!confirmed) {
      return;
    }

    await this.adminRepository.setUserBan(report.reportedUid, shouldBan, report);
    await this.loadDashboard();
  }

  async toggleReportedProfileHidden(report: AdminReport) {
    const reportedUser = this.findUser(report.reportedUid);
    const shouldHide = !(
      reportedUser?.isShadowBanned || reportedUser?.isVisible === false
    );
    const confirmed = await this.confirmAdminAction(
      shouldHide ? 'Hide reported profile?' : 'Restore profile visibility?',
      shouldHide
        ? 'This shadow hides the profile from discovery without deleting the account.'
        : 'This restores the profile visibility flag in users and match index.',
      shouldHide ? 'Hide profile' : 'Restore profile'
    );

    if (!confirmed) {
      return;
    }

    await this.adminRepository.setProfileHidden(
      report.reportedUid,
      shouldHide,
      report
    );
    await this.loadDashboard();
  }

  async sendWarning(report: AdminReport) {
    const message = await this.promptWarningMessage();

    if (!message) {
      return;
    }

    await this.adminRepository.sendWarning(
      report.reportedUid,
      message,
      report
    );
    await this.loadDashboard();
  }

  async openConversation(report: AdminReport) {
    this.selectedReport.set(report);
    this.activePanel.set('conversations');
    this.loading.set(true);
    this.error.set(null);

    try {
      this.selectedConversation.set(
        await this.adminRepository.loadConversationForReport(report)
      );
      if (!this.selectedConversation()) {
        this.error.set('Conversation could not be found for this report.');
      }
    } catch (error) {
      console.error(error);
      this.error.set('Conversation could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  async openConversationSummary(conversation: AdminConversationSummary) {
    this.activePanel.set('conversations');
    this.loading.set(true);
    this.error.set(null);

    try {
      this.selectedConversation.set(
        await this.adminRepository.loadConversation(conversation.id)
      );
      if (!this.selectedConversation()) {
        this.error.set('Conversation could not be found.');
      }
    } catch (error) {
      console.error(error);
      this.error.set('Conversation could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  async selectUser(user: AdminUser) {
    this.selectedUser.set(user);
    this.selectedBilling.set(await this.adminRepository.loadBilling(user.uid));
  }

  async viewBilling(user: AdminUser) {
    await this.selectUser(user);
    this.activePanel.set('billing');
  }

  viewReports(user: AdminUser) {
    const report = this.reports().find(
      (item) => item.reporterUid === user.uid || item.reportedUid === user.uid
    );

    if (report) {
      this.selectedReport.set(report);
      this.activePanel.set('reports');
    }
  }

  trackReport(_index: number, report: AdminReport) {
    return report.id;
  }

  trackUser(_index: number, user: AdminUser) {
    return user.uid;
  }

  trackConversation(_index: number, conversation: AdminConversationSummary) {
    return conversation.id;
  }

  trackMessage(_index: number, message: { id: string }) {
    return message.id;
  }

  trackStatusHistory(
    _index: number,
    history: { action: string; createdAt: string }
  ) {
    return `${history.action}-${history.createdAt}`;
  }

  trackAudit(_index: number, audit: AdminAuditLogEntry) {
    return audit.id;
  }

  trackReason(_index: number, reason: { reason: string }) {
    return reason.reason;
  }

  formatDate(value: unknown) {
    const date = this.toDate(value);

    if (!date) {
      return 'Unknown';
    }

    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  getUserName(uid: string) {
    return this.users().find((user) => user.uid === uid)?.displayName ?? uid;
  }

  getLastMessageText(conversation: AdminConversationSummary | null) {
    return conversation?.lastMessage?.text?.trim() || 'No messages found.';
  }

  getModerationState(user: AdminUser | null) {
    if (!user) {
      return 'Unknown profile';
    }

    if (user.isBanned) {
      return 'Banned';
    }

    if (user.isShadowBanned || user.isVisible === false) {
      return 'Hidden';
    }

    return 'Visible';
  }

  setSearch(value: string) {
    this.userSearch.set(value);
  }

  private async confirmAdminAction(
    header: string,
    message: string,
    confirmText: string
  ) {
    let confirmed = false;
    const alert = await this.alertCtrl.create({
      header,
      message,
      cssClass: 'premium-moderation-alert admin-confirm-alert',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'premium-alert-cancel-button',
        },
        {
          text: confirmText,
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

  private async promptWarningMessage() {
    let warningMessage = '';
    const alert = await this.alertCtrl.create({
      header: 'Send warning',
      message: 'Write the warning the user will receive in Amor notifications.',
      cssClass: 'premium-moderation-alert admin-confirm-alert',
      inputs: [
        {
          name: 'message',
          type: 'textarea',
          placeholder: 'Explain the policy or safety issue clearly.',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'premium-alert-cancel-button',
        },
        {
          text: 'Send warning',
          role: 'confirm',
          cssClass: 'premium-alert-confirm-button',
          handler: (data) => {
            warningMessage = String(data?.message ?? '').trim();

            return !!warningMessage;
          },
        },
      ],
    });

    await alert.present();
    await alert.onDidDismiss();

    return warningMessage;
  }

  private findUser(uid: string) {
    return this.users().find((user) => user.uid === uid) ?? null;
  }

  getConversationId(uidA: string, uidB: string) {
    return [uidA, uidB].sort((a, b) => a.localeCompare(b)).join('_');
  }

  private toDate(value: unknown) {
    if (!value) {
      return undefined;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'object') {
      const timestamp = value as { toDate?: () => Date };

      if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);

      return Number.isNaN(date.getTime()) ? undefined : date;
    }

    return undefined;
  }
}
