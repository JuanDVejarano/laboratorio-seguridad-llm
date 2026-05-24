import admin from 'firebase-admin';
import 'dotenv/config';

// FIREBASE_PRIVATE_KEY viene del JSON de la service account con \n literales.
// dotenv los mantiene como la cadena de dos caracteres "\\n", por lo que hay
// que reemplazarlos por saltos de línea reales para que el SDK los acepte.
const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

let adminApp;

if (!admin.apps.length) {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
} else {
  adminApp = admin.apps[0];
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export default admin;
