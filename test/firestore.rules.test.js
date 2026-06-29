const fs = require('node:fs');
const path = require('node:path');
const {
  after,
  before,
  beforeEach,
  test,
} = require('node:test');

const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

let testEnv;

const projectId = 'demo-amor-test';
const incomingLikePath = 'incomingLikes/target-user/likes/actor-user';
const adultBirthDate = new Date('2000-01-01T00:00:00.000Z');

const validPrivacyConsent = () => ({
  essential: true,
  termsAccepted: true,
  privacyPolicyAccepted: true,
  communityGuidelinesAccepted: true,
  ageConfirmed: true,
  crashReports: false,
  analytics: false,
  personalisation: false,
  marketingNotifications: false,
  consentVersion: '1.1.0',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const adultProfile = (uid, matches = []) => ({
  uid,
  firstName: uid,
  birthDate: '2000-01-01',
  birthDateTimestamp: adultBirthDate,
  age: 26,
  lookingForAge: {
    lower: 18,
    upper: 80,
  },
  privacyConsent: validPrivacyConsent(),
  matchParts: {
    matches,
    liked: [],
    notLiked: [],
    superLiked: [],
  },
});

const validMessage = (senderUid = 'alice', sentToUid = 'bob') => ({
  senderUid,
  sentToUid,
  text: 'Hello',
  type: 'text',
  number: 1,
  sentAt: new Date('2026-01-01T00:00:00.000Z'),
  readAt: null,
  isRead: false,
  attachments: [],
  gif: null,
  reactions: {},
  isDeleted: false,
  isStarred: false,
  isEdited: false,
  editedAt: null,
  deletedAt: null,
});

async function seedMatchedUsers(withConversation = true) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await db.doc('users/alice').set(adultProfile('alice', ['bob']));
    await db.doc('users/bob').set(adultProfile('bob', ['alice']));

    if (withConversation) {
      await db.doc('conversations/alice_bob').set({
        participants: ['alice', 'bob'],
        unreadCounts: {
          alice: 3,
          bob: 2,
        },
        typing: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
    }
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, '..', 'firestore.rules'),
        'utf8'
      ),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(incomingLikePath).set({
      actorUid: 'actor-user',
      type: 'like',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      seen: false,
      actorPreview: {
        firstName: 'Ada',
      },
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('incoming likes are readable by the target user and moderators only', async () => {
  const targetDb = testEnv.authenticatedContext('target-user').firestore();
  const actorDb = testEnv.authenticatedContext('actor-user').firestore();
  const moderatorDb = testEnv
    .authenticatedContext('moderator-user', { moderator: true })
    .firestore();

  await assertSucceeds(targetDb.doc(incomingLikePath).get());
  await assertSucceeds(moderatorDb.doc(incomingLikePath).get());
  await assertFails(actorDb.doc(incomingLikePath).get());
});

test('target user can only mark an incoming like as seen', async () => {
  const targetDb = testEnv.authenticatedContext('target-user').firestore();
  const likeRef = targetDb.doc(incomingLikePath);

  await assertSucceeds(
    likeRef.update({
      seen: true,
      seenAt: new Date('2026-01-01T00:01:00.000Z'),
    })
  );
  await assertFails(
    likeRef.update({
      seen: true,
      type: 'superLike',
    })
  );
});

test('clients cannot create or delete incoming likes', async () => {
  const targetDb = testEnv.authenticatedContext('target-user').firestore();

  await assertFails(
    targetDb.doc('incomingLikes/target-user/likes/new-actor').set({
      actorUid: 'new-actor',
      type: 'like',
      createdAt: new Date('2026-01-01T00:02:00.000Z'),
    })
  );
  await assertFails(targetDb.doc(incomingLikePath).delete());
});

test('profile creation requires adult birth date and age fields', async () => {
  const adultDb = testEnv.authenticatedContext('adult-user').firestore();
  const minorDb = testEnv.authenticatedContext('minor-user').firestore();

  await assertSucceeds(
    adultDb.doc('users/adult-user').set(adultProfile('adult-user'))
  );
  await assertFails(
    minorDb.doc('users/minor-user').set({
      ...adultProfile('minor-user'),
      birthDate: '2010-01-01',
      birthDateTimestamp: new Date('2010-01-01T00:00:00.000Z'),
      age: 16,
    })
  );
});

test('profile creation requires required legal and community consent', async () => {
  const db = testEnv.authenticatedContext('consent-user').firestore();
  const noConsentDb = testEnv.authenticatedContext('no-consent-user').firestore();

  await assertSucceeds(
    db.doc('users/consent-user').set({
      privacyConsent: validPrivacyConsent(),
    })
  );
  await assertFails(
    noConsentDb.doc('users/no-consent-user').set({
      ...adultProfile('no-consent-user'),
      privacyConsent: {
        ...validPrivacyConsent(),
        communityGuidelinesAccepted: false,
      },
    })
  );
});

test('client cannot write backend-owned daily usage counters', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();

  await assertFails(
    db.doc('users/alice/usage/2026-01-01').set({
      date: '2026-01-01',
      likesUsed: 0,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
  );
});

test('conversation creation requires an existing mutual match', async () => {
  await seedMatchedUsers(false);

  const aliceDb = testEnv.authenticatedContext('alice').firestore();

  await assertSucceeds(
    aliceDb.doc('conversations/alice_bob').set({
      participants: ['alice', 'bob'],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
  );
  await assertFails(
    aliceDb.doc('conversations/alice_bob_typing_spoof').set({
      participants: ['alice', 'bob'],
      typing: {
        bob: {
          forged: true,
        },
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
  );
  await assertFails(
    aliceDb.doc('conversations/alice_charlie').set({
      participants: ['alice', 'charlie'],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
  );
});

test('conversation updates are limited to own typing or own unread reset', async () => {
  await seedMatchedUsers();

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const conversationRef = aliceDb.doc('conversations/alice_bob');

  await assertSucceeds(
    conversationRef.update({
      typing: {
        alice: new Date('2026-01-01T00:01:00.000Z'),
      },
    })
  );
  await assertSucceeds(
    conversationRef.update({
      unreadCounts: {
        alice: 0,
        bob: 2,
      },
    })
  );
  await assertFails(
    conversationRef.update({
      typing: {
        bob: new Date('2026-01-01T00:02:00.000Z'),
      },
    })
  );
  await assertFails(
    conversationRef.update({
      participants: ['alice', 'charlie'],
    })
  );
  await assertFails(
    conversationRef.update({
      lastMessage: {
        senderUid: 'alice',
        sentToUid: 'bob',
        text: 'forged preview',
      },
    })
  );
});

test('message create is backend-owned', async () => {
  await seedMatchedUsers();

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const messageRef = aliceDb.doc('conversations/alice_bob/messages/msg-1');

  await assertFails(messageRef.set(validMessage()));
  await assertFails(
    aliceDb.doc('conversations/alice_bob/messages/msg-2').set({
      ...validMessage('alice', 'charlie'),
    })
  );
  await assertFails(
    aliceDb.doc('conversations/alice_bob/messages/msg-3').set({
      ...validMessage(),
      text: 'x'.repeat(2001),
    })
  );
  await assertFails(
    aliceDb.doc('conversations/alice_bob/messages/msg-4').set({
      ...validMessage(),
      attachments: ['https://example.com/file.jpg'],
    })
  );
});

test('message updates only allow recipient read and sender edit/delete fields', async () => {
  await seedMatchedUsers();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .doc('conversations/alice_bob/messages/msg-1')
      .set(validMessage());
  });

  const aliceDb = testEnv.authenticatedContext('alice').firestore();
  const bobDb = testEnv.authenticatedContext('bob').firestore();
  const aliceMessageRef = aliceDb.doc('conversations/alice_bob/messages/msg-1');
  const bobMessageRef = bobDb.doc('conversations/alice_bob/messages/msg-1');

  await assertFails(
    aliceMessageRef.update({
      isRead: true,
      readAt: new Date('2026-01-01T00:02:00.000Z'),
    })
  );
  await assertSucceeds(
    bobMessageRef.update({
      isRead: true,
      readAt: new Date('2026-01-01T00:02:00.000Z'),
    })
  );
  await assertFails(
    bobMessageRef.update({
      isRead: true,
      readAt: new Date('2026-01-01T00:02:00.000Z'),
      moderationOverride: true,
    })
  );
  await assertSucceeds(
    aliceMessageRef.update({
      text: 'Edited',
      type: 'text',
      gif: null,
      attachments: [],
      isEdited: true,
      editedAt: new Date('2026-01-01T00:03:00.000Z'),
    })
  );
  await assertSucceeds(
    bobMessageRef.update({
      reactions: {
        bob: {
          emoji: 'heart',
          updatedAt: new Date('2026-01-01T00:03:30.000Z'),
        },
      },
    })
  );
  await assertFails(
    bobMessageRef.update({
      reactions: {
        bob: {
          emoji: 'heart',
          updatedAt: new Date('2026-01-01T00:03:30.000Z'),
        },
        alice: {
          emoji: 'wave',
          updatedAt: new Date('2026-01-01T00:03:31.000Z'),
        },
      },
    })
  );
  await assertFails(
    aliceMessageRef.update({
      text: 'Edited again',
      type: 'text',
      gif: null,
      attachments: [],
      isEdited: true,
      editedAt: new Date('2026-01-01T00:04:00.000Z'),
      moderationOverride: true,
    })
  );
  await assertFails(
    aliceMessageRef.update({
      sentToUid: 'charlie',
    })
  );
});
