import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit as firestoreLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
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
  statusHistory: AdminReportStatusHistory[];
};

export type AdminReportStatusHistory = {
  status: ModerationReportStatus;
  action: string;
  note: string;
  moderatorUid: string;
  moderatorEmail: string;
  createdAt: string;
};

export type AdminUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  age?: number;
  gender: string;
  currentPlace: string;
  aboutMe: string;
  interests: string[];
  isBanned: boolean;
  isShadowBanned: boolean;
  isVisible: boolean;
  warningCount: number;
  lastWarningAt: unknown;
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
  lastMessage: {
    number: number;
    senderUid: string;
    sentToUid: string;
    text: string;
  } | null;
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

export type AdminAuditLogEntry = {
  id: string;
  action: string;
  actorUid: string;
  actorEmail: string;
  targetUid: string;
  reportId: string;
  createdAt: unknown;
  details: string;
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
          statusHistory: this.mapStatusHistory(data.statusHistory),
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

  async loadReportedConversationSummaries(
    reports?: AdminReport[]
  ): Promise<AdminConversationSummary[]> {
    return this.runInFirebaseContext(async () => {
      const sourceReports =
        reports ??
        (await getDocs(collection(this.firestore, 'reports'))).docs.map(
          (reportSnapshot) => {
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
              statusHistory: this.mapStatusHistory(data.statusHistory),
            };
          }
        );

      const reportedConversationIds = [
        ...new Set(
          sourceReports
            .filter((report) => report.reporterUid && report.reportedUid)
            .map((report) =>
              this.getConversationId(report.reporterUid, report.reportedUid)
            )
        ),
      ];

      const conversationPromises: Array<Promise<AdminConversationSummary | null>> =
        reportedConversationIds.map(async (conversationId) => {
          const conversationSnapshot = await getDoc(
            doc(this.firestore, `conversations/${conversationId}`)
          );

          if (!conversationSnapshot.exists()) {
            return null;
          }

          const data = conversationSnapshot.data() as {
            participants?: unknown;
            lastMessage?: unknown;
            updatedAt?: unknown;
          };

          return {
            id: conversationSnapshot.id,
            participants: this.toStringArray(data.participants),
            lastMessage: this.mapLastMessage(data.lastMessage),
            updatedAt: data.updatedAt ?? null,
          };
        });
      const conversations = await Promise.all(conversationPromises);
      const existingConversations = conversations.filter(
        (conversation): conversation is AdminConversationSummary =>
          conversation !== null
      );

      return existingConversations.sort(
        (a, b) => this.toMillis(b.updatedAt) - this.toMillis(a.updatedAt)
      );
    });
  }

  async loadConversationSummaries(): Promise<AdminConversationSummary[]> {
    return this.runInFirebaseContext(async () => {
      const conversationsRef = collection(this.firestore, 'conversations');
      const conversationsQuery = query(
        conversationsRef,
        orderBy('updatedAt', 'desc')
      );
      const snapshot = await getDocs(conversationsQuery);

      return snapshot.docs.map((conversationSnapshot) => {
        const data = conversationSnapshot.data() as {
          participants?: unknown;
          lastMessage?: unknown;
          updatedAt?: unknown;
        };

        return {
          id: conversationSnapshot.id,
          participants: this.toStringArray(data.participants),
          lastMessage: this.mapLastMessage(data.lastMessage),
          updatedAt: data.updatedAt ?? null,
        };
      });
    });
  }

  async updateReportStatus(
    report: AdminReport,
    status: ModerationReportStatus,
    note = ''
  ) {
    await this.updateReportModerationState(
      report,
      status,
      'report_status_updated',
      note || `Report marked ${status}.`
    );
  }

  async blockReportedUser(report: AdminReport) {
    const historyItem = this.createStatusHistoryItem(
      'action_taken',
      'reported_user_blocked',
      'Reported user was blocked for the reporter.'
    );

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
          statusHistory: arrayUnion(historyItem),
          updatedAt: serverTimestamp(),
        });
      })
    );

    await this.writeAuditLog({
      action: 'reported_user_blocked',
      targetUid: report.reportedUid,
      reportId: report.id,
      details: 'Reported user was added to the reporter blocked list.',
    });
  }

  async removeMatchForReport(report: AdminReport) {
    const historyItem = this.createStatusHistoryItem(
      'action_taken',
      'match_removed',
      'Match was removed for both users.'
    );

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
          statusHistory: arrayUnion(historyItem),
          updatedAt: serverTimestamp(),
        });
      })
    );

    await this.writeAuditLog({
      action: 'match_removed',
      targetUid: report.reportedUid,
      reportId: report.id,
      details: 'Match was removed for both users.',
    });
  }

  async setUserBan(
    uid: string,
    isBanned: boolean,
    report?: AdminReport | null
  ) {
    await this.runInFirebaseContext(async () => {
      await updateDoc(doc(this.firestore, `users/${uid}`), {
        isBanned,
        ...(isBanned
          ? {
              isVisible: false,
              bannedAt: serverTimestamp(),
              bannedBy: this.getCurrentAdminUid(),
            }
          : {
              unbannedAt: serverTimestamp(),
              unbannedBy: this.getCurrentAdminUid(),
            }),
      });

      await setDoc(
        doc(this.firestore, `matchIndex/${uid}`),
        {
          isBanned,
          ...(isBanned ? { isVisible: false } : {}),
          lastModeratedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    if (report) {
      await this.updateReportModerationState(
        report,
        'action_taken',
        isBanned ? 'user_banned' : 'user_unbanned',
        isBanned ? 'Reported user was banned.' : 'Reported user was unbanned.'
      );
      return;
    }

    await this.writeAuditLog({
      action: isBanned ? 'user_banned' : 'user_unbanned',
      targetUid: uid,
      reportId: '',
      details: isBanned ? 'User was banned.' : 'User was unbanned.',
    });
  }

  async setProfileHidden(
    uid: string,
    isHidden: boolean,
    report?: AdminReport | null
  ) {
    await this.runInFirebaseContext(async () => {
      await updateDoc(doc(this.firestore, `users/${uid}`), {
        isShadowBanned: isHidden,
        isVisible: !isHidden,
        hiddenByAdmin: isHidden,
        lastModeratedAt: serverTimestamp(),
        lastModeratedBy: this.getCurrentAdminUid(),
      });

      await setDoc(
        doc(this.firestore, `matchIndex/${uid}`),
        {
          isShadowBanned: isHidden,
          isVisible: !isHidden,
          lastModeratedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    if (report) {
      await this.updateReportModerationState(
        report,
        'action_taken',
        isHidden ? 'profile_hidden' : 'profile_restored',
        isHidden
          ? 'Reported profile was hidden from discovery.'
          : 'Reported profile visibility was restored.'
      );
      return;
    }

    await this.writeAuditLog({
      action: isHidden ? 'profile_hidden' : 'profile_restored',
      targetUid: uid,
      reportId: '',
      details: isHidden
        ? 'Profile was hidden from discovery.'
        : 'Profile visibility was restored.',
    });
  }

  async sendWarning(
    uid: string,
    message: string,
    report?: AdminReport | null
  ) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return;
    }

    await this.runInFirebaseContext(async () => {
      const warningPayload = {
        message: trimmedMessage,
        reportId: report?.id ?? '',
        moderatorUid: this.getCurrentAdminUid(),
        moderatorEmail: this.getCurrentAdminEmail(),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(this.firestore, `users/${uid}/warnings`), warningPayload);
      await addDoc(collection(this.firestore, `users/${uid}/notifications`), {
        type: 'moderation_warning',
        title: 'Amor safety warning',
        body: trimmedMessage,
        isRead: false,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(this.firestore, `users/${uid}`), {
        warningCount: increment(1),
        lastWarningAt: serverTimestamp(),
        lastModeratedAt: serverTimestamp(),
        lastModeratedBy: this.getCurrentAdminUid(),
      });
    });

    if (report) {
      await this.updateReportModerationState(
        report,
        'action_taken',
        'warning_sent',
        'Warning was sent to the reported user.'
      );
      return;
    }

    await this.writeAuditLog({
      action: 'warning_sent',
      targetUid: uid,
      reportId: '',
      details: trimmedMessage,
    });
  }

  async loadAuditLog(limit = 80): Promise<AdminAuditLogEntry[]> {
    return this.runInFirebaseContext(async () => {
      const auditRef = collection(this.firestore, 'moderationAudit');
      const auditQuery = query(
        auditRef,
        orderBy('createdAt', 'desc'),
        firestoreLimit(limit)
      );
      const snapshot = await getDocs(auditQuery);

      return snapshot.docs.map((auditSnapshot) => {
        const data = auditSnapshot.data() as Partial<AdminAuditLogEntry>;

        return {
          id: auditSnapshot.id,
          action: data.action ?? '',
          actorUid: data.actorUid ?? '',
          actorEmail: data.actorEmail ?? '',
          targetUid: data.targetUid ?? '',
          reportId: data.reportId ?? '',
          createdAt: data.createdAt ?? null,
          details: data.details ?? '',
        };
      });
    });
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
    const matchingConversation = (
      await this.loadReportedConversationSummaries([report])
    ).find(
      (conversation: AdminConversationSummary) =>
        conversation.participants.length === participants.length &&
        conversation.participants
          .slice()
          .sort((a: string, b: string) => a.localeCompare(b))
          .every(
            (participant: string, index: number) =>
              participant === participants[index]
          )
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
      return this.runInFirebaseContext(async () => {
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
          lastMessage: this.mapLastMessage(conversationData.lastMessage),
          updatedAt: conversationData.updatedAt ?? null,
          messages,
        };
      });
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
      age: this.toOptionalNumber(profile?.['age']),
      gender: String(profile?.['gender'] ?? ''),
      currentPlace: String(profile?.['currentPlace'] ?? ''),
      aboutMe: String(profile?.['aboutMe'] ?? ''),
      interests: this.toStringArray(profile?.['interests']),
      isBanned: profile?.['isBanned'] === true,
      isShadowBanned: profile?.['isShadowBanned'] === true,
      isVisible: profile?.['isVisible'] !== false,
      warningCount: Number(profile?.['warningCount'] ?? 0),
      lastWarningAt: profile?.['lastWarningAt'] ?? null,
      createdProfile: !!profile && (!!firstName || !!lastName),
      isPremium: billing?.isPremium === true,
      blockedUsersCount: this.toStringArray(profile?.['blockedUsers']).length,
      reportsCount: reports.filter(
        (report) => report.reporterUid === uid || report.reportedUid === uid
      ).length,
    };
  }

  private async updateReportModerationState(
    report: AdminReport,
    status: ModerationReportStatus,
    action: string,
    note: string
  ) {
    const historyItem = this.createStatusHistoryItem(status, action, note);

    await this.runInFirebaseContext(() =>
      updateDoc(doc(this.firestore, `reports/${report.id}`), {
        status,
        statusHistory: arrayUnion(historyItem),
        updatedAt: serverTimestamp(),
      })
    );

    await this.writeAuditLog({
      action,
      targetUid: report.reportedUid,
      reportId: report.id,
      details: note,
    });
  }

  private createStatusHistoryItem(
    status: ModerationReportStatus,
    action: string,
    note: string
  ): AdminReportStatusHistory {
    return {
      status,
      action,
      note,
      moderatorUid: this.getCurrentAdminUid(),
      moderatorEmail: this.getCurrentAdminEmail(),
      createdAt: new Date().toISOString(),
    };
  }

  private async writeAuditLog(input: {
    action: string;
    targetUid: string;
    reportId?: string;
    details?: string;
  }) {
    await this.runInFirebaseContext(() =>
      addDoc(collection(this.firestore, 'moderationAudit'), {
        action: input.action,
        actorUid: this.getCurrentAdminUid(),
        actorEmail: this.getCurrentAdminEmail(),
        targetUid: input.targetUid,
        reportId: input.reportId ?? '',
        details: input.details ?? '',
        createdAt: serverTimestamp(),
      })
    );
  }

  private getCurrentAdminUid() {
    return this.auth.currentUser?.uid ?? 'unknown-admin';
  }

  private getCurrentAdminEmail() {
    return this.auth.currentUser?.email ?? '';
  }

  private mapStatusHistory(value: unknown): AdminReportStatusHistory[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        status: this.toReportStatus(item['status']),
        action: String(item['action'] ?? ''),
        note: String(item['note'] ?? ''),
        moderatorUid: String(item['moderatorUid'] ?? ''),
        moderatorEmail: String(item['moderatorEmail'] ?? ''),
        createdAt: String(item['createdAt'] ?? ''),
      }))
      .sort((a, b) => this.toMillis(b.createdAt) - this.toMillis(a.createdAt));
  }

  private toReportStatus(value: unknown): ModerationReportStatus {
    if (
      value === 'open' ||
      value === 'reviewed' ||
      value === 'dismissed' ||
      value === 'action_taken'
    ) {
      return value;
    }

    return 'open';
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

  private toOptionalNumber(value: unknown) {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private mapLastMessage(value: unknown): AdminConversationSummary['lastMessage'] {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const lastMessage = value as {
      number?: unknown;
      senderUid?: unknown;
      sentToUid?: unknown;
      text?: unknown;
    };

    return {
      number: Number(lastMessage?.number ?? 0),
      senderUid: String(lastMessage?.senderUid ?? ''),
      sentToUid: String(lastMessage?.sentToUid ?? ''),
      text: String(lastMessage?.text ?? ''),
    };
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
