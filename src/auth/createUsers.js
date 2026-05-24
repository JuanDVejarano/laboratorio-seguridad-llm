import { adminAuth } from '../config/admin.js';
import chalk from 'chalk';
import 'dotenv/config';

// Definición de los tres usuarios de prueba con sus roles.
// El custom claim { role } es lo que leen las Firestore Security Rules
// a través de request.auth.token.role — no puede ser manipulado desde el cliente.
const usuarios = [
  {
    email: process.env.USER_VENTAS_EMAIL,
    password: process.env.USER_VENTAS_PASSWORD,
    displayName: 'Ejecutivo de Ventas (Demo)',
    role: 'ejecutivo_ventas',
  },
  {
    email: process.env.USER_COBRANZA_EMAIL,
    password: process.env.USER_COBRANZA_PASSWORD,
    displayName: 'Gestor de Cobranza (Demo)',
    role: 'gestor_cobranza',
  },
  {
    email: process.env.USER_FINANZAS_EMAIL,
    password: process.env.USER_FINANZAS_PASSWORD,
    displayName: 'Director de Finanzas (Demo)',
    role: 'director_finanzas',
  },
];

async function crearOActualizarUsuario({ email, password, displayName, role }) {
  let uid;

  try {
    // Intentar crear el usuario
    const userRecord = await adminAuth.createUser({ email, password, displayName });
    uid = userRecord.uid;
    console.log(chalk.green(`✓ Usuario creado: ${email} (uid: ${uid})`));
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      // Si ya existe, obtener su UID para actualizar el claim
      const existente = await adminAuth.getUserByEmail(email);
      uid = existente.uid;
      console.log(chalk.yellow(`~ Usuario ya existe: ${email} (uid: ${uid}) — actualizando claim`));
    } else {
      throw err;
    }
  }

  // Asignar (o sobreescribir) el custom claim de rol.
  // Importante: los custom claims propagan en el próximo ID token que emita Firebase.
  // En el demo se obtiene un ID token fresco después de autenticar, por lo que
  // el claim estará disponible inmediatamente en las Security Rules.
  await adminAuth.setCustomUserClaims(uid, { role });
  console.log(chalk.cyan(`  → Custom claim asignado: { role: '${role}' }\n`));

  return { email, uid, role };
}

async function main() {
  console.log(chalk.bold('\n═══════════════════════════════════════════'));
  console.log(chalk.bold('  Setup de usuarios — Laboratorio LLM      '));
  console.log(chalk.bold('═══════════════════════════════════════════\n'));

  const resultados = [];
  for (const usuario of usuarios) {
    const resultado = await crearOActualizarUsuario(usuario);
    resultados.push(resultado);
  }

  console.log(chalk.bold('\nResumen:'));
  resultados.forEach(({ email, uid, role }) => {
    console.log(`  ${chalk.white(email)} → ${chalk.cyan(role)} → uid: ${chalk.gray(uid)}`);
  });
  console.log();
}

main().catch((err) => {
  console.error(chalk.red('Error al crear usuarios:'), err.message);
  process.exit(1);
});
