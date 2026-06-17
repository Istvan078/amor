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
const bucketUrl = `gs://${projectId}.appspot.com`;

const imageMetadata = {
  contentType: 'image/jpeg',
};

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    storage: {
      rules: fs.readFileSync(
        path.join(__dirname, '..', 'storage.rules'),
        'utf8'
      ),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

after(async () => {
  await testEnv.cleanup();
});

test('owners can upload private profile pictures but not public processed copies', async () => {
  const ownerStorage = testEnv
    .authenticatedContext('user-a')
    .storage(bucketUrl);

  await assertSucceeds(
    ownerStorage
      .ref('pictures/user-a/photo.jpg')
      .putString('image-bytes', 'raw', imageMetadata)
  );
  await assertFails(
    ownerStorage
      .ref('publicPictures/user-a/photo.jpg')
      .putString('image-bytes', 'raw', imageMetadata)
  );
});

test('public processed pictures are readable by signed-in users only', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context
      .storage(bucketUrl)
      .ref('publicPictures/user-a/photo.jpg')
      .putString('image-bytes', 'raw', imageMetadata);
  });

  const signedInStorage = testEnv
    .authenticatedContext('user-b')
    .storage(bucketUrl);
  const anonymousStorage = testEnv.unauthenticatedContext().storage(bucketUrl);

  await assertSucceeds(
    signedInStorage.ref('publicPictures/user-a/photo.jpg').getDownloadURL()
  );
  await assertFails(
    anonymousStorage.ref('publicPictures/user-a/photo.jpg').getDownloadURL()
  );
});

test('private pictures and verification selfies stay owner-only', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all([
      context
        .storage(bucketUrl)
        .ref('pictures/user-a/private.jpg')
        .putString('image-bytes', 'raw', imageMetadata),
      context
        .storage(bucketUrl)
        .ref('verificationSelfies/user-a/selfie.jpg')
        .putString('image-bytes', 'raw', imageMetadata),
    ]);
  });

  const ownerStorage = testEnv
    .authenticatedContext('user-a')
    .storage(bucketUrl);
  const otherStorage = testEnv
    .authenticatedContext('user-b')
    .storage(bucketUrl);

  await assertSucceeds(
    ownerStorage.ref('pictures/user-a/private.jpg').getDownloadURL()
  );
  await assertSucceeds(
    ownerStorage.ref('verificationSelfies/user-a/selfie.jpg').getDownloadURL()
  );
  await assertFails(
    otherStorage.ref('pictures/user-a/private.jpg').getDownloadURL()
  );
  await assertFails(
    otherStorage.ref('verificationSelfies/user-a/selfie.jpg').getDownloadURL()
  );
});
