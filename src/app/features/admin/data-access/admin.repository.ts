import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  updateDoc,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthUser } from '../../auth/store/auth.slice';
import { BillingCurrent } from '../../billing/data-access/billing.repository';
import { ModerationReportStatus } from '../../moderation/models/moderation.model';

export type AdminReport = {
  id: string;
  reportId: string;
  reporterUid: string;
  reportedUid: string;
  reason: string;
  description: string;
  createdAt: unknown;
  status: ModerationReportStatus;
};

export type AdminUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdProfile: boolean;
  isPremium: boolean;
  blockedUsersCount: number;
  reportsCount: number;
};

export type AdminConversationMessage = {
  id: string;
  senderUid: string;
  text: string;
  sentAt: unknown;
  number: number;
};

export type AdminConversationSummary = {
  id: string;
  participants: string[];
  lastMessage: unknown;
  updatedAt: unknown;
};

export type AdminConversation = AdminConversationSummary & {
  messages: AdminConversationMessage[];
};

export type AdminBillingSnapshot = {
  isPremium: boolean;
  activeEntitlements: string[];
  activeSubscriptions: string[];
  superLikesBalance: number;
  expiresAt: string | null;
  productId: string | null;
  platform: string;
};

@Injectable({
  providedIn: 'root',
})
export class AdminRepository {
  private injector = inject(Injector);
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private http = inject(HttpClient);

  async loadReports(): Promise<AdminReport[]> {
    return this.runInFirebaseContext(async () => {
      const reportsRef = collection(this.firestore, 'reports');
      const reportsQuery = query(reportsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(reportsQuery);

      return snapshot.docs.map((reportSnapshot) => {
        const data = reportSnapshot.data() as Partial<AdminReport>;

        return {
          id: reportSnapshot.id,
          reportId: data.reportId ?? reportSnapshot.id,
          reporterUid: data.reporterUid ?? '',
          reportedUid: data.reportedUid ?? '',
          reason: data.reason ?? 'other',
          description: data.description ?? '',
          createdAt: data.createdAt ?? null,
          status: data.status ?? 'open',
        };
      });
    });
  }

  async loadUsers(reports: AdminReport[]): Promise<AdminUser[]> {
    const [authUsers, profileSnapshot] = await Promise.all([
      this.loadAuthUsers(),
      this.runInFirebaseContext(() => getDocs(collection(this.firestore, 'users'))),
    ]);
    const profileByUid = new Map(
      profileSnapshot.docs.map((profileDoc) => [
        profileDoc.id,
        profileDoc.data() as Record<string, unknown>,
      ])
    );
    const authUsersByUid = new Map(
      authUsers.map((authUser) => [authUser.uid, authUser])
    );
    const userIds = new Set<string>([
      ...profileByUid.keys(),
      ...authUsersByUid.keys(),
    ]);

    const users = await Promise.all(
      [...userIds].map(async (uid) => {
        const profile = profileByUid.get(uid);
        const authUser = authUsersByUid.get(uid);
        const billing = await this.loadBilling(uid);

        return this.mapAdminUser(uid, profile, authUser, billing, reports);
      })
    );

    return users.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async loadBilling(uid: string): Promise<AdminBillingSnapshot | null> {
    return this.runInFirebaseContext(async () => {
      const billingRef = doc(this.firestore, `users/${uid}/billing/current`);
      const snapshot = await getDoc(billingRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data() as Partial<BillingCurrent>;

      return {
        isPremium: data.isPremium === true,
        activeEntitlements: this.toStringArray(data.activeEntitlements),
        activeSubscriptions: this.toStringArray(data.activeSubscriptions),
        superLikesBalance: Number(data.consumables?.superLikes ?? 0),
        expiresAt: data.expiresAt ?? null,
        productId: data.productId ?? null,
        platform: data.platform ?? 'web',
      };
    });
  }

  async loadConversationSummaries(): Promise<AdminConversationSummary[]> {
    return this.runInFirebaseContext(async () => {
      const conversationsSnapshot = await getDocs(
        collection(this.firestore, 'conversations')
      );

      return conversationsSnapshot.docs
        .map((conversationSnapshot) => {
          const data = conversationSnapshot.data() as {
            participants?: unknown;
            lastMessage?: unknown;
            updatedAt?: unknown;
          };

          return {
            id: conversationSnapshot.id,
            participants: this.toStringArray(data.participants),
            lastMessage: data.lastMessage ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        })
        .sort(
          (a, b) =>
            this.toMillis(b.updatedAt) -
            this.toMillis(a.updatedAt)
        );
    });
  }

  async updateReportStatus(
    report: AdminReport,
    status: ModerationReportStatus
  ) {
    await this.runInFirebaseContext(() =>
      updateDoc(doc(this.firestore, `reports/${report.id}`), { status })
    );
  }

  async blockReportedUser(report: AdminReport) {
    await this.runInFirebaseContext(() =>
      runTransaction(this.firestore, async (transaction) => {
        const reporterRef = doc(this.firestore, `users/${report.reporterUid}`);
        const reporterSnapshot = await transaction.get(reporterRef);
        const reporterData = reporterSnapshot.data() as
          | { blockedUsers?: string[] }
          | undefined;

        transaction.update(reporterRef, {
          blockedUsers: this.withUniqueUid(
            reporterData?.blockedUsers,
            report.reportedUid
          ),
        });

        transaction.update(doc(this.firestore, `reports/${report.id}`), {
          status: 'action_taken',
        });
      })
    );
  }

  async removeMatchForReport(report: AdminReport) {
    await this.runInFirebaseContext(() =>
      runTransaction(this.firestore, async (transaction) => {
        const reporterRef = doc(this.firestore, `users/${report.reporterUid}`);
        const reportedRef = doc(this.firestore, `users/${report.reportedUid}`);
        const reporterSnapshot = await transaction.get(reporterRef);
        const reportedSnapshot = await transaction.get(reportedRef);
        const reporterData = reporterSnapshot.data() as
          | { matchParts?: Record<string, string[] | undefined> }
          | undefined;
        const reportedData = reportedSnapshot.data() as
          | { matchParts?: Record<string, string[] | undefined> }
          | undefined;
        const reporterMatchParts = reporterData?.matchParts ?? {};
        const reportedMatchParts = reportedData?.matchParts ?? {};

        transaction.update(reporterRef, {
          matchParts: {
            ...reporterMatchParts,
            matches: this.withoutUid(
              reporterMatchParts['matches'],
              report.reportedUid
            ),
            liked: this.withoutUid(reporterMatchParts['liked'], report.reportedUid),
            superLiked: this.withoutUid(
              reporterMatchParts['superLiked'],
              report.reportedUid
            ),
            notLiked: this.withUniqueUid(
              reporterMatchParts['notLiked'],
              report.reportedUid
            ),
          },
        });

        transaction.update(reportedRef, {
          matchParts: {
            ...reportedMatchParts,
            matches: this.withoutUid(
              reportedMatchParts['matches'],
              report.reporterUid
            ),
            liked: this.withoutUid(reportedMatchParts['liked'], report.reporterUid),
            superLiked: this.withoutUid(
              reportedMatchParts['superLiked'],
              report.reporterUid
            ),
          },
        });

        transaction.update(doc(this.firestore, `reports/${report.id}`), {
          status: 'action_taken',
        });
      })
    );
  }

  async loadConversationForReport(
    report: AdminReport
  ): Promise<AdminConversation | null> {
    const conversationId = this.getConversationId(
      report.reporterUid,
      report.reportedUid
    );
    const directConversation = await this.loadConversation(conversationId);

    if (directConversation) {
      return directConversation;
    }

    const participants = [report.reporterUid, report.reportedUid].sort((a, b) =>
      a.localeCompare(b)
    );
    const matchingConversation = (await this.loadConversationSummaries()).find(
      (conversation) =>
        conversation.participants.length === participants.length &&
        conversation.participants
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .every((participant, index) => participant === participants[index])
    );

    return matchingConversation
      ? this.loadConversation(matchingConversation.id)
      : null;
  }

  async loadConversation(
    conversationId: string
  ): Promise<AdminConversation | null> {
    return this.runInFirebaseContext(async () => {
      const conversationRef = doc(this.firestore, `conversations/${conversationId}`);
      const conversationSnapshot = await getDoc(conversationRef);

      if (!conversationSnapshot.exists()) {
        return null;
      }

      const conversationData = conversationSnapshot.data() as {
        participants?: unknown;
        lastMessage?: unknown;
        updatedAt?: unknown;
      };
      const messagesRef = collection(conversationRef, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      const messages = messagesSnapshot.docs
        .map((messageSnapshot) => {
          const data = messageSnapshot.data();

          return {
            id: messageSnapshot.id,
            senderUid: String(data['senderUid'] ?? ''),
            text: String(data['text'] ?? data['message'] ?? ''),
            sentAt: data['sentAt'] ?? null,
            number: Number(data['number'] ?? 0),
          };
        })
        .sort(
          (a, b) =>
            a.number - b.number ||
            this.toMillis(a.sentAt) - this.toMillis(b.sentAt)
        );

      return {
        id: conversationSnapshot.id,
        participants: this.toStringArray(conversationData.participants),
        lastMessage: conversationData.lastMessage ?? null,
        updatedAt: conversationData.updatedAt ?? null,
        messages,
      };
    });
  }

  private async loadAuthUsers() {
    const idToken = await this.auth.currentUser?.getIdToken();

    if (!idToken) {
      return [];
    }

    try {
      return await firstValueFrom(
        this.http.get<AuthUser[]>(`${environment.API_URL}users`, {
          headers: new HttpHeaders().set('Authorization', idToken),
        })
      );
    } catch (error) {
      console.warn('Admin users API unavailable, using profile documents only.', error);
      return [];
    }
  }

  private mapAdminUser(
    uid: string,
    profile: Record<string, unknown> | undefined,
    authUser: AuthUser | undefined,
    billing: AdminBillingSnapshot | null,
    reports: AdminReport[]
  ): AdminUser {
    const firstName = String(profile?.['firstName'] ?? '').trim();
    const lastName = String(profile?.['lastName'] ?? '').trim();
    const profileDisplayName = [firstName, lastName].filter(Boolean).join(' ');
    const displayName =
      profileDisplayName ||
      authUser?.displayName ||
      authUser?.email ||
      uid.slice(0, 8);

    return {
      uid,
      email: authUser?.email ?? String(profile?.['email'] ?? ''),
      displayName,
      photoURL:
        authUser?.photoURL ??
        String(profile?.['profilePicture'] ?? '') ??
        '',
      createdProfile: !!profile && (!!firstName || !!lastName),
      isPremium: billing?.isPremium === true,
      blockedUsersCount: this.toStringArray(profile?.['blockedUsers']).length,
      reportsCount: reports.filter(
        (report) => report.reporterUid === uid || report.reportedUid === uid
      ).length,
    };
  }

  private getConversationId(uidA: string, uidB: string) {
    return [uidA, uidB].sort((a, b) => a.localeCompare(b)).join('_');
  }

  private withoutUid(values: string[] | undefined, uid: string) {
    return (Array.isArray(values) ? values : []).filter((value) => value !== uid);
  }

  private withUniqueUid(values: string[] | undefined, uid: string) {
    const nextValues = Array.isArray(values) ? [...values] : [];

    if (!nextValues.includes(uid)) {
      nextValues.push(uid);
    }

    return nextValues;
  }

  private toStringArray(values: unknown) {
    return Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string')
      : [];
  }

  private toMillis(value: unknown) {
    if (!value) {
      return 0;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'object') {
      const maybeTimestamp = value as { toDate?: () => Date };

      if (typeof maybeTimestamp.toDate === 'function') {
        return maybeTimestamp.toDate().getTime();
      }
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);

      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    return 0;
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}
