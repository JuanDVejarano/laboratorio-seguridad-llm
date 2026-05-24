import { clientAuth } from '../config/client.js';
import { signInWithEmailAndPassword } from 'firebase/auth';

// Autentica un usuario con email/password usando el SDK Web (que respeta
// las Security Rules) y retorna el ID token firmado por Firebase.
// Este token contiene los custom claims (incluido "role") asignados por el Admin SDK.
export async function autenticarYObtenerToken(email, password) {
  const credencial = await signInWithEmailAndPassword(clientAuth, email, password);
  // forceRefresh=true garantiza que el token incluya los custom claims más recientes,
  // en caso de que hayan sido actualizados después del último login.
  const idToken = await credencial.user.getIdToken(true);
  return { user: credencial.user, idToken };
}

// Retorna el usuario actualmente autenticado en el cliente SDK
export function usuarioActual() {
  return clientAuth.currentUser;
}
