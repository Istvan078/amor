import { FormsModule } from '@angular/forms';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  banOutline,
  cardOutline,
  chatbubblesOutline,
  checkmarkDoneOutline,
  closeCircleOutline,
  eyeOutline,
  flagOutline,
  peopleOutline,
  shieldCheckmarkOutline,
  trashOutline,
} from 'ionicons/icons';

import {
  AdminBillingSnapshot,
  AdminConversation,
  AdminReport,
  AdminRepository,
  AdminUser,
} from './data-access/admin.repository';

type AdminPanel = 'reports' | 'users' | 'conversations' | 'billing';

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
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly userSearch = signal('');

  readonly openReports = computed(
    () => this.reports().filter((report) => report.status === 'open').length
  );
  readonly premiumUsers = computed(
    () => this.users().filter((user) => user.isPremium).length
  );
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

  constructor() {
    addIcons({
      banOutline,
      cardOutline,
      chatbubblesOutline,
      checkmarkDoneOutline,
      closeCircleOutline,
      eyeOutline,
      flagOutline,
      peopleOutline,
      shieldCheckmarkOutline,
      trashOutline,
    });
  }

  async ngOnInit() {
    await this.loadDashboard();
  }

  async loadDashboard() {
    this.loading.set(true);
    this.error.set(null);

    try {
      const reports = await this.adminRepository.loadReports();
      const users = await this.adminRepository.loadUsers(reports);

      this.reports.set(reports);
      this.users.set(users);
      this.selectedReport.set(reports[0] ?? null);
      this.selectedUser.set(users[0] ?? null);

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
    await this.adminRepository.blockReportedUser(report);
    await this.loadDashboard();
  }

  async removeMatch(report: AdminReport) {
    await this.adminRepository.removeMatchForReport(report);
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

  trackMessage(_index: number, message: { id: string }) {
    return message.id;
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

  setSearch(value: string) {
    this.userSearch.set(value);
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
