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
