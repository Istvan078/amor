/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import { Environments } from './config/config';
import * as fs from 'fs';
import * as webpush from 'web-push';
const serviceAccount = JSON.parse(
 fs.readFileSync(Environments.SERVICE_ACCOUNT_ROUTE, 'utf-8')
);
admin.initializeApp({
 credential: admin.credential.cert(serviceAccount),
 databaseURL: Environments.DATABASE_URL,
 storageBucket: Environments.STORAGE_BUCKET,
});

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
//   admin.firestore().collection('users').doc('test').get().then((doc: DocumentSnapshot) => {
//     console.log(doc.data().gender);
//   }
//   );
// });

const app = express();

app.use(bodyParser.json());
// app.use(fileParser);

const verifyToken = (req: any, res: any, next: any) => {
 const idToken = req.headers.authorization;

 admin
  .auth()
  .verifyIdToken(idToken)
  .then((decodedToken) => {
   req.user = decodedToken;
   next();
  })
  .catch((error) => {
   console.error('Hiba történt a token ellenőrzésekor:', error);
   res.sendStatus(401);
  });
};

app.post('/setCustomClaims', verifyToken, (req, res) => {
 const { uid, claims } = req.body;
 admin
  .auth()
  .setCustomUserClaims(uid, claims)
  .then(() => {
   console.log('Felhasználó claimsek sikeresen beállítva.');
   res.json({ message: 'OK' });
  })
  .catch((error) => {
   console.error('Hiba történt a felhasználó claimsek beállításakor:', error);
   res.sendStatus(500);
  });
});

app.post('/setUserProfile', (req, res) => {
 const { uid, displayName, profilePicture, phoneNumber, email } = req.body;
 admin
  .auth()
  .updateUser(uid, {
   displayName: displayName,
   photoURL: profilePicture,
   phoneNumber: phoneNumber,
   email: email,
  })
  .then((userRec) => {
   res.json({ message: 'Sikeres profil módosítás!', uid: uid });
  })
  .catch((err) => console.error(err));
});

app.post('/deleteUser', (req, res) => {
 const { uid } = req.body;
 admin
  .auth()
  .deleteUser(uid)
  .then(() => res.json({ message: 'Felhasználó sikeresen törölve!' }))
  .catch((err) => console.error(err));
});

app.get('/users', verifyToken, (req, res) => {
 admin
  .auth()
  .listUsers()
  .then((userRecords) => {
   const users = userRecords.users.map((user) => ({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    claims: user.customClaims,
    profilePicture: user.photoURL,
    phoneNumber: user.phoneNumber,
    // Egyéb felhasználói adatok ......
   }));
   res.json(users);
  })
  .catch((error) => {
   console.error('Hiba történt a felhasználók lekérésekor:', error);
   res.sendStatus(500);
  });
});

app.get('/users/:uid/claims', verifyToken, (req, res) => {
 const { uid } = req.params;
 admin
  .auth()
  .getUser(uid)
  .then((userRecord) => {
   res.json(userRecord.customClaims);
  })
  .catch((error) => {
   console.error('Hiba történt a felhasználó lekérdezésekor:', error);
   res.sendStatus(500);
  });
});

// const vapidKeys = {
//  publicKey: Environments.VAPID_PUBLIC_KEY,
//  privateKey: Environments.VAPID_PRIVATE_KEY,
// };

// inicializálás
// webpush.setVapidDetails(
//  'mailto:kalmaristvan078@gmail.com',
//  vapidKeys.publicKey,
//  vapidKeys.privateKey
// );

app.route('/message').post((req, res) => {
 const msg = req.body.msg;
 const reaction = req.body.reaction;
 const subscriptions = req.body.sub;
 const openUrl = 'https://project0781.web.app/message/';
 const reactedFriendId = msg.reactedFriendId;

 const notificationPayload = {
  notification: {
   title: reaction ? msg.reactedDName : msg.displayName,
   body: reaction ? reaction + '( ' + msg.message + ' )' : msg.message,
   icon: reaction ? msg.reactedProfPhoto : msg.profilePhoto,
   vibrate: [100, 50, 100],
   data: {
    onActionClick: {
     default: {
      operation: 'openWindow',
      url: reaction ? openUrl + reactedFriendId : openUrl + msg.senderId,
     },
     navigate: {
      operation: 'openWindow',
      url: reaction ? openUrl + reactedFriendId : openUrl + msg.senderId,
     },
    },
   },
   actions: [
    {
     action: 'navigate',
     title: 'Elolvasom',
    },
   ],
  },
 };

 const sendNotifications = subscriptions.map((sub: any) => {
  return webpush.sendNotification(sub, JSON.stringify(notificationPayload));
 });

 Promise.all(sendNotifications)
  .then((response) =>
   res.status(200).json({ message: 'Értesítés sikeresen elküldve!' })
  )
  .catch((err) => {
   console.error('Hiba az értesítés kiküldésekor', err);
   res.sendStatus(500);
  });
});

export const api = onRequest({ cors: true }, app);
