import 'dotenv/config';
import chalk from 'chalk';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { adminApp } from '../config/admin.js';
import { askLLM } from '../llm/askLLM.js';
import { runWithCorrelationId, getCorrelationId } from '../observability/correlationId.js';
import { logger, flushLogs } from '../observability/logger.js';
import { detectPIIInObject } from '../observability/piiDetector.js';

// Configuración del SDK Web (lee del .env)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Inicializa el SDK Web con un nombre explícito para evitar colisión con el Admin SDK
const clientApp =
  getApps().find((a) => a.name === 'client') ??
  initializeApp(firebaseConfig, 'client');
const clientDb = getFirestore(clientApp);
const clientAuth = getAuth(clientApp);

const PREGUNTA_DEMO =
  '¿Cuál es la deuda actual de Falabella Retail y cuál es nuestro margen con el proveedor que provee sus tarjetas?';

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de display
// ─────────────────────────────────────────────────────────────────────────────

function separador(titulo) {
  console.log('\n' + chalk.gray('═'.repeat(70)));
  console.log(chalk.bold(titulo));
  console.log(chalk.gray('═'.repeat(70)));
}

function mostrarColecciones(resultados) {
  for (const [nombre, docs] of Object.entries(resultados)) {
    const color = docs.length > 0 ? chalk.green : chalk.red;
    console.log(color(`  ${nombre}: ${docs.length} documento(s)`));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lee una colección con el SDK Web (respeta Security Rules).
// Retorna [] si la regla deniega el acceso — y lo registra como evento de seguridad.
// ─────────────────────────────────────────────────────────────────────────────
async function leerColeccionSegura(nombreColeccion, rol) {
  try {
    const snap = await getDocs(collection(clientDb, nombreColeccion));
    const docs = snap.docs.map((d) => d.data());

    logger.info('firestore.lectura_exitosa', {
      coleccion: nombreColeccion,
      rol,
      documentos_retornados: docs.length,
    });

    return docs;
  } catch (err) {
    // Las Security Rules de Firestore lanzan PERMISSION_DENIED.
    // Lo capturamos, lo registramos como evento de seguridad y retornamos [].
    // Esto es evidencia de que el control de acceso funcionó correctamente.
    logger.warn('firestore.acceso_denegado', {
      coleccion: nombreColeccion,
      rol,
      error_codigo: err.code,
      control_rbac: 'activo',
    });
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Escenario 0 — El antipatrón inseguro (Admin SDK, sin restricciones)
// ─────────────────────────────────────────────────────────────────────────────
async function escenario0() {
  return runWithCorrelationId(async () => {
    const corrId = getCorrelationId();
    separador(`ESCENARIO 0 — ANTIPATRÓN INSEGURO [correlation_id: ${corrId}]`);

    logger.warn('escenario.iniciado', {
      escenario: 0,
      descripcion: 'antipatron_inseguro',
      correlation_id: corrId,
    });

    // El Admin SDK bypasea las Security Rules completamente
    const db = adminFirestore(adminApp);
    const colecciones = ['crm_ventas', 'crm_cobranza', 'finanzas_internas'];
    const contexto = {};

    for (const col of colecciones) {
      const snap = await db.collection(col).get();
      contexto[col] = snap.docs.map((d) => d.data());
    }

    console.log(chalk.red('\n⚠  Admin SDK: sin restricciones de acceso'));
    mostrarColecciones(contexto);

    // Detecta PII en el contexto completo antes de enviarlo al LLM (punto de detección 1)
    const piiContexto = detectPIIInObject(contexto);
    logger.warn('pii.detectada_en_contexto', {
      escenario: 0,
      pii_counts: piiContexto,
      destino: 'llm',
      alerta: 'exfiltracion_potencial',
    });

    console.log(chalk.yellow(`\n  PII detectada en contexto: ${JSON.stringify(piiContexto)}`));
    console.log(chalk.gray(`  Modelo: ${process.env.LLM_MODEL}`));

    const respuesta = await askLLM(contexto, PREGUNTA_DEMO, {
      escenario: 0,
      rol: 'admin_sin_restricciones',
      tipo: 'antipatron',
    });

    console.log(chalk.red('\n🔴 EXFILTRACIÓN DE DATOS — el LLM accedió a información que ningún rol individual debería ver\n'));
    console.log(chalk.white('Respuesta del LLM:'));
    console.log(chalk.yellow(respuesta));

    logger.warn('escenario.completado', {
      escenario: 0,
      resultado: 'exfiltracion_datos',
      correlation_id: corrId,
    });

    return corrId;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Escenarios 1, 2, 3 — Roles con Security Rules activas
// ─────────────────────────────────────────────────────────────────────────────
async function escenarioRol(numero, email, password, rol, coleccionesPermitidas) {
  return runWithCorrelationId(async () => {
    const corrId = getCorrelationId();
    separador(`ESCENARIO ${numero} — ${rol.toUpperCase()} [correlation_id: ${corrId}]`);

    logger.info('escenario.iniciado', {
      escenario: numero,
      rol,
      email,
      correlation_id: corrId,
    });

    // Autenticación con el SDK Web: obtiene un ID token con los custom claims del rol
    await signInWithEmailAndPassword(clientAuth, email, password);
    logger.info('auth.login_exitoso', { rol, email });

    // Intenta leer las tres colecciones. Las reglas filtran automáticamente.
    const todasColecciones = ['crm_ventas', 'crm_cobranza', 'finanzas_internas'];
    const contexto = {};

    for (const col of todasColecciones) {
      contexto[col] = await leerColeccionSegura(col, rol);
    }

    mostrarColecciones(contexto);

    // Solo envía al LLM las colecciones que efectivamente retornaron datos
    const contextoFiltrado = Object.fromEntries(
      Object.entries(contexto).filter(([, v]) => v.length > 0)
    );

    const piiContexto = detectPIIInObject(contextoFiltrado);
    console.log(chalk.gray(`\n  PII en contexto enviado al LLM: ${JSON.stringify(piiContexto)}`));
    console.log(chalk.gray(`  Colecciones con datos: ${Object.keys(contextoFiltrado).join(', ') || 'ninguna'}`));
    console.log(chalk.gray(`  Modelo: ${process.env.LLM_MODEL}`));

    const respuesta = await askLLM(contextoFiltrado, PREGUNTA_DEMO, {
      escenario: numero,
      rol,
      colecciones_permitidas: coleccionesPermitidas,
      colecciones_con_datos: Object.keys(contextoFiltrado),
    });

    const coleccionesDenegadas = todasColecciones.filter(
      (c) => !coleccionesPermitidas.includes(c)
    );

    if (coleccionesDenegadas.length > 0) {
      console.log(chalk.green('\n🟢 Sistema seguro — el contexto fue filtrado en la capa de datos\n'));
    } else {
      console.log(chalk.blue('\n🔵 Acceso completo legítimo — el rol autoriza todas las colecciones\n'));
    }

    console.log(chalk.white('Respuesta del LLM:'));
    console.log(chalk.cyan(respuesta));

    logger.info('escenario.completado', {
      escenario: numero,
      rol,
      colecciones_denegadas: coleccionesDenegadas,
      control_rbac: coleccionesDenegadas.length > 0 ? 'activo_y_efectivo' : 'sin_restricciones_para_este_rol',
      correlation_id: corrId,
    });

    return corrId;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(chalk.bold.cyan('\n🔍 DEMO DE SEGURIDAD + OBSERVABILIDAD — Laboratorio LLM\n'));
  console.log(chalk.gray('Cada escenario genera un correlation_id único que aparece'));
  console.log(chalk.gray('tanto en Better Stack (logs) como en LangSmith (trazas LLM).\n'));

  const correlationIds = {};

  correlationIds[0] = await escenario0();

  correlationIds[1] = await escenarioRol(
    1,
    process.env.USER_VENTAS_EMAIL,
    process.env.USER_VENTAS_PASSWORD,
    'ejecutivo_ventas',
    ['crm_ventas']
  );

  correlationIds[2] = await escenarioRol(
    2,
    process.env.USER_COBRANZA_EMAIL,
    process.env.USER_COBRANZA_PASSWORD,
    'gestor_cobranza',
    ['crm_ventas', 'crm_cobranza']
  );

  correlationIds[3] = await escenarioRol(
    3,
    process.env.USER_FINANZAS_EMAIL,
    process.env.USER_FINANZAS_PASSWORD,
    'director_finanzas',
    ['crm_ventas', 'crm_cobranza', 'finanzas_internas']
  );

  // ─── Resumen de correlation IDs ────────────────────────────────────────────
  // Este bloque es el punto de entrada para investigar cualquier escenario
  // en ambas herramientas de observabilidad.
  separador('RESUMEN DE TRAZABILIDAD');
  console.log(chalk.white('Usa estos IDs para cruzar logs en Better Stack con trazas en LangSmith:\n'));

  for (const [escenario, id] of Object.entries(correlationIds)) {
    console.log(chalk.gray(`  Escenario ${escenario}: `) + chalk.yellow(id));
    console.log(chalk.gray(`    Better Stack → filtrar por correlation_id = "${id}"`));
    console.log(chalk.gray(`    LangSmith    → filtrar por metadata.correlation_id = "${id}"`));
    console.log();
  }

  console.log(chalk.gray(`  LangSmith proyecto: ${process.env.LANGCHAIN_PROJECT ?? 'ver LANGCHAIN_PROJECT en .env'}`));
  console.log(chalk.gray('  LangSmith URL: https://smith.langchain.com\n'));

  // Asegura que todos los logs llegaron a Better Stack antes de salir
  await flushLogs();
  process.exit(0);
}

main().catch((err) => {
  logger.error('demo.error_fatal', { mensaje: err.message, stack: err.stack });
  console.error(chalk.red('Error fatal:'), err);
  process.exit(1);
});
