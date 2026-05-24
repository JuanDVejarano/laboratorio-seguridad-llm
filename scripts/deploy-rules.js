import 'dotenv/config';
import { execSync } from 'child_process';

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  console.error('Error: FIREBASE_PROJECT_ID no está definido en .env');
  process.exit(1);
}

console.log(`Desplegando reglas en proyecto: ${projectId}\n`);
execSync(`npx firebase deploy --only firestore:rules --project ${projectId}`, { stdio: 'inherit' });
