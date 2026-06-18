import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import type { Bucket, File } from '@google-cloud/storage';
const sharp = require('sharp');
import { StorageEvent } from 'firebase-functions/v2/storage';

type ImageUploadKind = 'privateProfile' | 'publicProfile' | 'verificationSelfie';

type ParsedImagePath = {
  kind: ImageUploadKind;
  root: 'pictures' | 'publicPictures' | 'verificationSelfies';
  uid: string;
  fileName: string;
  objectPath: string;
};

type ModerationStatus = 'approved' | 'rejected' | 'review_required';

type ModerationResult = {
  status: ModerationStatus;
  labels: Record<string, string>;
  reason?: string;
};

const IMAGE_PROCESSOR = 'amor-image-pipeline-v1';
const PUBLIC_PICTURES_ROOT = 'publicPictures';
const PRIVATE_PICTURES_ROOT = 'pictures';
const VERIFICATION_SELFIES_ROOT = 'verificationSelfies';
const THUMBNAILS_FOLDER = 'thumbs';
const REJECTED_IMAGES_ROOT = 'moderationRejectedImages';
const MAX_PROFILE_IMAGE_DIMENSION = 1600;
const THUMBNAIL_DIMENSION = 480;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 78;
const UNSAFE_LIKELIHOODS = new Set(['LIKELY', 'VERY_LIKELY']);

let visionClient: ImageAnnotatorClient | null = null;

const getVisionClient = () => {
  if (!visionClient) {
    visionClient = new ImageAnnotatorClient();
  }

  return visionClient;
};

const parseImagePath = (objectPath: string): ParsedImagePath | null => {
  const [root, uid, ...fileNameParts] = objectPath.split('/');
  const fileName = fileNameParts.join('/');

  if (!uid || !fileName || fileNameParts[0] === THUMBNAILS_FOLDER) {
    return null;
  }

  if (root === PRIVATE_PICTURES_ROOT) {
    return {
      kind: 'privateProfile',
      root,
      uid,
      fileName,
      objectPath,
    };
  }

  if (root === PUBLIC_PICTURES_ROOT) {
    return {
      kind: 'publicProfile',
      root,
      uid,
      fileName,
      objectPath,
    };
  }

  if (root === VERIFICATION_SELFIES_ROOT) {
    return {
      kind: 'verificationSelfie',
      root,
      uid,
      fileName,
      objectPath,
    };
  }

  return null;
};

const getPublicPicturePath = (imagePath: ParsedImagePath) =>
  `${PUBLIC_PICTURES_ROOT}/${imagePath.uid}/${getPublicFileName(imagePath.fileName)}`;

const getPublicFileName = (fileName: string) =>
  fileName
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '') || `${randomUUID()}.jpg`;

const getThumbnailPath = (uid: string, publicFileName: string) => {
  const baseName = publicFileName.replace(/\.[^.]+$/, '') || randomUUID();

  return `${PUBLIC_PICTURES_ROOT}/${uid}/${THUMBNAILS_FOLDER}/${baseName}.webp`;
};

const buildDownloadUrl = (
  bucketName: string,
  objectPath: string,
  downloadToken: string
) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    objectPath
  )}?alt=media&token=${downloadToken}`;

const getDownloadToken = (metadata: Record<string, string> = {}) =>
  metadata.firebaseStorageDownloadTokens || randomUUID();

const getModerationDocId = (bucketName: string, objectPath: string) =>
  Buffer.from(`${bucketName}/${objectPath}`).toString('base64url');

const toSafeSearchLabel = (value: unknown) =>
  typeof value === 'string' ? value : 'UNKNOWN';

const detectUnsafeImage = async (
  imageBuffer: Buffer
): Promise<ModerationResult> => {
  try {
    const [result] = await getVisionClient().safeSearchDetection({
      image: {
        content: imageBuffer,
      },
    });
    const annotation = result.safeSearchAnnotation ?? {};
    const labels = {
      adult: toSafeSearchLabel(annotation.adult),
      violence: toSafeSearchLabel(annotation.violence),
      racy: toSafeSearchLabel(annotation.racy),
      medical: toSafeSearchLabel(annotation.medical),
      spoof: toSafeSearchLabel(annotation.spoof),
    };
    const unsafeReason = (['adult', 'violence', 'racy'] as const).find((key) =>
      UNSAFE_LIKELIHOODS.has(labels[key])
    );

    if (unsafeReason) {
      return {
        status: 'rejected',
        labels,
        reason: unsafeReason,
      };
    }

    return {
      status: 'approved',
      labels,
    };
  } catch (error) {
    console.error('Image SafeSearch moderation failed:', error);

    return {
      status: 'approved',
      labels: {},
      reason: 'safe_search_unavailable',
    };
  }
};

const processMainImage = (imageBuffer: Buffer) =>
  sharp(imageBuffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_PROFILE_IMAGE_DIMENSION,
      height: MAX_PROFILE_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
    })
    .toBuffer();

const processThumbnail = (imageBuffer: Buffer) =>
  sharp(imageBuffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: THUMBNAIL_DIMENSION,
      height: THUMBNAIL_DIMENSION,
      fit: 'cover',
      position: 'attention',
    })
    .webp({
      quality: WEBP_QUALITY,
    })
    .toBuffer();

const writeModerationRecord = async (
  input: {
    bucketName: string;
    imagePath: ParsedImagePath;
    moderation: ModerationResult;
    publicPath?: string;
    thumbnailPath?: string;
    rejectedPath?: string;
  }
) => {
  const db = admin.firestore();

  await db
    .collection('imageModeration')
    .doc(getModerationDocId(input.bucketName, input.imagePath.objectPath))
    .set(
      {
        uid: input.imagePath.uid,
        kind: input.imagePath.kind,
        bucket: input.bucketName,
        path: input.imagePath.objectPath,
        publicPath: input.publicPath ?? '',
        thumbnailPath: input.thumbnailPath ?? '',
        rejectedPath: input.rejectedPath ?? '',
        status: input.moderation.status,
        labels: input.moderation.labels,
        reason: input.moderation.reason ?? '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
};

const updateUserPictureThumbnail = async (
  uid: string,
  publicFileName: string,
  thumbnailUrl: string,
  moderationStatus: ModerationStatus
) => {
  const userRef = admin.firestore().collection('users').doc(uid);
  const snapshot = await userRef.get();

  if (!snapshot.exists) {
    return;
  }

  const profile = snapshot.data() ?? {};
  const pictures = Array.isArray(profile.pictures) ? profile.pictures : [];
  let changed = false;
  const nextPictures = pictures.map((picture) => {
    if (!picture || typeof picture !== 'object') {
      return picture;
    }

    const pictureData = picture as Record<string, unknown>;

    if (pictureData.name !== publicFileName) {
      return picture;
    }

    changed = true;

    return {
      ...pictureData,
      thumbnailUrl,
      imageModerationStatus: moderationStatus,
    };
  });

  if (!changed) {
    return;
  }

  await userRef.set(
    {
      pictures: nextPictures,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
};

const removeRejectedPublicPictureReference = async (
  uid: string,
  publicFileName: string
) => {
  const userRef = admin.firestore().collection('users').doc(uid);
  const snapshot = await userRef.get();

  if (!snapshot.exists) {
    return;
  }

  const profile = snapshot.data() ?? {};
  const pictures = Array.isArray(profile.pictures) ? profile.pictures : [];
  const nextPictures = pictures.filter((picture) => {
    if (!picture || typeof picture !== 'object') {
      return true;
    }

    return (picture as Record<string, unknown>).name !== publicFileName;
  });

  if (nextPictures.length === pictures.length) {
    return;
  }

  const nextPrimaryPicture = nextPictures.find((picture) => {
    return (
      picture &&
      typeof picture === 'object' &&
      typeof (picture as Record<string, unknown>).url === 'string'
    );
  }) as Record<string, unknown> | undefined;

  await userRef.set(
    {
      pictures: nextPictures,
      profilePicture:
        typeof nextPrimaryPicture?.url === 'string'
          ? nextPrimaryPicture.url
          : admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
};

const rejectImageUpload = async (
  input: {
    bucket: Bucket;
    file: File;
    imagePath: ParsedImagePath;
    moderation: ModerationResult;
    originalBuffer: Buffer;
    originalMetadata: Record<string, string>;
    contentType: string;
  }
) => {
  const rejectedPath = `${REJECTED_IMAGES_ROOT}/${input.imagePath.kind}/${input.imagePath.uid
    }/${Date.now()}-${getPublicFileName(input.imagePath.fileName)}`;
  const rejectedFile = input.bucket.file(rejectedPath);

  await rejectedFile.save(input.originalBuffer, {
    resumable: false,
    metadata: {
      contentType: input.contentType,
      metadata: {
        ...input.originalMetadata,
        originalPath: input.imagePath.objectPath,
        moderationStatus: input.moderation.status,
        moderationReason: input.moderation.reason ?? '',
        processedBy: IMAGE_PROCESSOR,
      },
    },
  });
  await input.file.delete({ ignoreNotFound: true });

  if (input.imagePath.kind === 'publicProfile') {
    await removeRejectedPublicPictureReference(
      input.imagePath.uid,
      getPublicFileName(input.imagePath.fileName)
    );
  }

  if (input.imagePath.kind === 'verificationSelfie') {
    await admin.firestore().collection('users').doc(input.imagePath.uid).set(
      {
        profileVerificationStatus: 'rejected',
        profileVerified: false,
        profileVerificationReviewNote:
          'Verification selfie was rejected by automated image safety checks.',
        profileVerificationReviewedAt:
          admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await writeModerationRecord({
    bucketName: input.bucket.name,
    imagePath: input.imagePath,
    moderation: input.moderation,
    rejectedPath,
  });
};

export const processProfileImageObject = async (event: StorageEvent) => {
  const object = event.data;
  const objectPath = object.name;
  const imagePath = parseImagePath(objectPath);
  const contentType = object.contentType ?? '';
  const customMetadata = object.metadata ?? {};

  if (
    !imagePath ||
    !contentType.startsWith('image/') ||
    customMetadata.processedBy === IMAGE_PROCESSOR
  ) {
    return;
  }

  const bucket = admin.storage().bucket(object.bucket);
  const file = bucket.file(objectPath);
  const [originalBuffer] = await file.download();
  const moderation = await detectUnsafeImage(originalBuffer);

  if (moderation.status !== 'approved') {
    await rejectImageUpload({
      bucket,
      file,
      imagePath,
      moderation,
      originalBuffer,
      originalMetadata: customMetadata,
      contentType,
    });
    return;
  }

  if (imagePath.kind === 'verificationSelfie') {
    const processedBuffer = await processMainImage(originalBuffer);
    const sourceDownloadToken = getDownloadToken(customMetadata);
    const processedAt = new Date().toISOString();

    await file.save(processedBuffer, {
      resumable: false,
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          ...customMetadata,
          originalPath: imagePath.objectPath,
          processedAt,
          processedBy: IMAGE_PROCESSOR,
          moderationStatus: moderation.status,
          moderationReason: moderation.reason ?? '',
          firebaseStorageDownloadTokens: sourceDownloadToken,
        },
      },
    });

    await writeModerationRecord({
      bucketName: bucket.name,
      imagePath,
      moderation,
    });

    return;
  }

  const [processedBuffer, thumbnailBuffer] = await Promise.all([
    processMainImage(originalBuffer),
    processThumbnail(originalBuffer),
  ]);
  const publicFileName = getPublicFileName(imagePath.fileName);
  const publicPath =
    imagePath.kind === 'publicProfile'
      ? imagePath.objectPath
      : getPublicPicturePath(imagePath);
  const thumbnailPath = getThumbnailPath(imagePath.uid, publicFileName);
  const sourceDownloadToken = getDownloadToken(customMetadata);
  const publicDownloadToken =
    imagePath.kind === 'publicProfile' ? sourceDownloadToken : randomUUID();
  const thumbnailDownloadToken = randomUUID();
  const processedAt = new Date().toISOString();
  const baseMetadata = {
    originalPath: imagePath.objectPath,
    processedAt,
    processedBy: IMAGE_PROCESSOR,
    moderationStatus: moderation.status,
    moderationReason: moderation.reason ?? '',
  };

  await Promise.all([
    file.save(processedBuffer, {
      resumable: false,
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
        metadata: {
          ...customMetadata,
          ...baseMetadata,
          firebaseStorageDownloadTokens: sourceDownloadToken,
        },
      },
    }),
    bucket.file(publicPath).save(processedBuffer, {
      resumable: false,
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
        metadata: {
          ...baseMetadata,
          sourcePath: imagePath.objectPath,
          firebaseStorageDownloadTokens: publicDownloadToken,
        },
      },
    }),
    bucket.file(thumbnailPath).save(thumbnailBuffer, {
      resumable: false,
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000',
        metadata: {
          ...baseMetadata,
          sourcePath: publicPath,
          thumbnailFor: publicPath,
          firebaseStorageDownloadTokens: thumbnailDownloadToken,
        },
      },
    }),
  ]);

  const thumbnailUrl = buildDownloadUrl(
    bucket.name,
    thumbnailPath,
    thumbnailDownloadToken
  );

  if (
    imagePath.kind === 'publicProfile' ||
    imagePath.kind === 'privateProfile'
  ) {
    await updateUserPictureThumbnail(
      imagePath.uid,
      publicFileName,
      thumbnailUrl,
      moderation.status
    );
  }

  await writeModerationRecord({
    bucketName: bucket.name,
    imagePath,
    moderation,
    publicPath,
    thumbnailPath,
  });
};
