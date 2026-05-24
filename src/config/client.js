import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import 'dotenv/config';

// SDK Web modular v10+: estas credenciales son públicas por diseño.
// La seguridad real la imponen las Firestore Security Rules en el servidor,
// no el hecho de que la apiKey sea secreta.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const clientApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const clientAuth = getAuth(clientApp);
export const clientDb = getFirestore(clientApp);
