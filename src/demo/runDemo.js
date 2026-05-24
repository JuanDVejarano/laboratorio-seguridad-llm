import { adminDb } from '../config/admin.js';
import { clientAuth, clientDb } from '../config/client.js';
import { autenticarYObtenerToken } from '../auth/getCustomToken.js';
import { askLLM } from '../llm/askLLM.js';
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
} from 'firebase/firestore';
import chalk from 'chalk';
import 'dotenv/config';

// Pregunta fija para todos los escenarios.
// Es intencionalmente transversal: requiere datos de las TRES colecciones
// para ser respondida completamente. Así se hace evidente qué puede y qué no
// puede ver cada rol.
const PREGUNTA_DEMO =
  '¿Cuál es la deuda actual de Falabella Retail y cuál es nuestro margen con el proveedor que provee sus tarjetas?';

const SEPARADOR = '═'.repeat(65);
const SEPARADOR_FINO = '─'.repeat(65);

// ──────────────────────────────────────────────
// Helpers de lectura
// ──────────────────────────────────────────────

// Lee una colección completa usando el Admin SDK (sin restricciones de reglas).
async function leerConAdmin(nombreColeccion) {
  const snap = await adminDb.collection(nombreColeccion).get();
  return snap.docs.map((d) => d.data());
}

// Lee una colección usando el SDK Web (respeta las Firestore Security Rules).
// Si el usuario autenticado no tiene permiso, Firebase lanza un error PERMISSION_DENIED
// que capturamos y convertimos en array vacío — exactamente como se debe manejar en producción.
async function leerConClienteSDK(nombreColeccion) {
  try {
    const snap = await getDocs(query(collection(clientDb, nombreColeccion)));
    return snap.docs.map((d) => d.data());
  } catch (err) {
    if (err.code === 'permission-denied') {
      return []; // Las reglas denegaron el acceso — array vacío es la respuesta correcta
    }
    throw err;
  }
}

// ──────────────────────────────────────────────
// Visualización
// ──────────────────────────────────────────────

function imprimirEncabezadoEscenario(numero, titulo, colorFn) {
  console.log('\n' + chalk.bold(colorFn(SEPARADOR)));
  console.log(chalk.bold(colorFn(`  ESCENARIO ${numero}: ${titulo}`)));
  console.log(chalk.bold(colorFn(SEPARADOR)));
}

function imprimirInfoColecciones(ventas, cobranza, finanzas) {
  console.log(chalk.gray('\n  Documentos recibidos del servidor:'));
  console.log(chalk.gray(`    crm_ventas         → ${ventas.length} doc(s)`));
  console.log(chalk.gray(`    crm_cobranza       → ${cobranza.length} doc(s)`));
  console.log(chalk.gray(`    finanzas_internas  → ${finanzas.length} doc(s)`));
}

function imprimirContextoLLM(contexto) {
  console.log(chalk.gray('\n  Extracto del contexto enviado al LLM:'));
  const resumen = {
    crm_ventas: contexto.crm_ventas.map((d) => ({ empresa: d.empresa, monto: d.monto_venta })),
    crm_cobranza: contexto.crm_cobranza.map((d) => ({ empresa: d.empresa, deuda: d.deuda_total })),
    finanzas_internas: contexto.finanzas_internas.map((d) => ({
      empresa: d.empresa,
      margen: d.margen_porcentaje,
    })),
  };
  console.log(chalk.gray('  ' + JSON.stringify(resumen, null, 2).replace(/\n/g, '\n  ')));
}

function imprimirRespuestaLLM(respuesta) {
  console.log(chalk.gray('\n  ' + SEPARADOR_FINO));
  console.log(chalk.white('\n  Respuesta del LLM:\n'));
  respuesta.split('\n').forEach((linea) => console.log('  ' + chalk.white(linea)));
}

// ──────────────────────────────────────────────
// Escenarios
// ──────────────────────────────────────────────

async function escenario0_antipatron() {
  imprimirEncabezadoEscenario(0, 'ANTIPATRÓN — Sin restricción (Admin SDK)', chalk.red);

  console.log(chalk.gray(`\n  Rol activo     : Sin restricción — Admin SDK`));
  console.log(chalk.gray(`  Modelo LLM     : ${process.env.LLM_MODEL}`));

  // El Admin SDK bypasea las Security Rules completamente.
  // Esto simula el antipatrón más común: una capa de servicio que consulta
  // la base de datos completa y la pasa al LLM sin filtrar.
  const ventas = await leerConAdmin('crm_ventas');
  const cobranza = await leerConAdmin('crm_cobranza');
  const finanzas = await leerConAdmin('finanzas_internas');

  imprimirInfoColecciones(ventas, cobranza, finanzas);

  const contexto = { crm_ventas: ventas, crm_cobranza: cobranza, finanzas_internas: finanzas };
  imprimirContextoLLM(contexto);

  console.log(chalk.gray('\n  Consultando al LLM...'));
  const respuesta = await askLLM(contexto, PREGUNTA_DEMO);
  imprimirRespuestaLLM(respuesta);

  console.log('\n' + chalk.bgRed.white.bold(
    '  ⚠  EXFILTRACIÓN DE DATOS — el LLM accedió a información que ningún rol individual debería ver  '
  ));
  console.log(chalk.red('\n  Un ejecutivo de ventas que obtenga acceso al LLM podría extraer'));
  console.log(chalk.red('  márgenes internos y deudas de clientes — datos para los que no tiene autorización.\n'));
}

async function escenario1_ventas() {
  imprimirEncabezadoEscenario(1, 'Ejecutivo de Ventas', chalk.green);

  console.log(chalk.gray(`\n  Rol activo     : ejecutivo_ventas`));
  console.log(chalk.gray(`  Modelo LLM     : ${process.env.LLM_MODEL}`));
  console.log(chalk.gray(`  Usuario        : ${process.env.USER_VENTAS_EMAIL}`));

  await autenticarYObtenerToken(process.env.USER_VENTAS_EMAIL, process.env.USER_VENTAS_PASSWORD);

  // Las Security Rules permiten leer crm_ventas a este rol,
  // pero devuelven PERMISSION_DENIED en crm_cobranza y finanzas_internas.
  const ventas = await leerConClienteSDK('crm_ventas');
  const cobranza = await leerConClienteSDK('crm_cobranza');
  const finanzas = await leerConClienteSDK('finanzas_internas');

  imprimirInfoColecciones(ventas, cobranza, finanzas);

  const contexto = { crm_ventas: ventas, crm_cobranza: cobranza, finanzas_internas: finanzas };
  imprimirContextoLLM(contexto);

  console.log(chalk.gray('\n  Consultando al LLM...'));
  const respuesta = await askLLM(contexto, PREGUNTA_DEMO);
  imprimirRespuestaLLM(respuesta);

  console.log('\n' + chalk.bgGreen.black.bold(
    '  ✓ Sistema seguro — el contexto fue filtrado en la capa de datos  '
  ));
  console.log(chalk.green('\n  El LLM no pudo responder sobre deuda ni márgenes porque'));
  console.log(chalk.green('  Firestore nunca envió esos datos al servidor Node.js.\n'));
}

async function escenario2_cobranza() {
  imprimirEncabezadoEscenario(2, 'Gestor de Cobranza', chalk.yellow);

  console.log(chalk.gray(`\n  Rol activo     : gestor_cobranza`));
  console.log(chalk.gray(`  Modelo LLM     : ${process.env.LLM_MODEL}`));
  console.log(chalk.gray(`  Usuario        : ${process.env.USER_COBRANZA_EMAIL}`));

  await autenticarYObtenerToken(process.env.USER_COBRANZA_EMAIL, process.env.USER_COBRANZA_PASSWORD);

  // Las reglas permiten crm_ventas y crm_cobranza para este rol,
  // pero bloquean finanzas_internas.
  const ventas = await leerConClienteSDK('crm_ventas');
  const cobranza = await leerConClienteSDK('crm_cobranza');
  const finanzas = await leerConClienteSDK('finanzas_internas');

  imprimirInfoColecciones(ventas, cobranza, finanzas);

  const contexto = { crm_ventas: ventas, crm_cobranza: cobranza, finanzas_internas: finanzas };
  imprimirContextoLLM(contexto);

  console.log(chalk.gray('\n  Consultando al LLM...'));
  const respuesta = await askLLM(contexto, PREGUNTA_DEMO);
  imprimirRespuestaLLM(respuesta);

  console.log('\n' + chalk.bgYellow.black.bold(
    '  ~ Acceso parcial — deuda visible, márgenes internos protegidos  '
  ));
  console.log(chalk.yellow('\n  El LLM puede responder sobre la deuda de Falabella (crm_cobranza),'));
  console.log(chalk.yellow('  pero no sobre el margen del proveedor (finanzas_internas).\n'));
}

async function escenario3_finanzas() {
  imprimirEncabezadoEscenario(3, 'Director de Finanzas', chalk.cyan);

  console.log(chalk.gray(`\n  Rol activo     : director_finanzas`));
  console.log(chalk.gray(`  Modelo LLM     : ${process.env.LLM_MODEL}`));
  console.log(chalk.gray(`  Usuario        : ${process.env.USER_FINANZAS_EMAIL}`));

  await autenticarYObtenerToken(process.env.USER_FINANZAS_EMAIL, process.env.USER_FINANZAS_PASSWORD);

  // El director de finanzas tiene acceso a las tres colecciones.
  // Las reglas lo confirman: su rol aparece en todos los bloques de allow read.
  const ventas = await leerConClienteSDK('crm_ventas');
  const cobranza = await leerConClienteSDK('crm_cobranza');
  const finanzas = await leerConClienteSDK('finanzas_internas');

  imprimirInfoColecciones(ventas, cobranza, finanzas);

  const contexto = { crm_ventas: ventas, crm_cobranza: cobranza, finanzas_internas: finanzas };
  imprimirContextoLLM(contexto);

  console.log(chalk.gray('\n  Consultando al LLM...'));
  const respuesta = await askLLM(contexto, PREGUNTA_DEMO);
  imprimirRespuestaLLM(respuesta);

  console.log('\n' + chalk.bgCyan.black.bold(
    '  ✓ Acceso legítimo completo — el rol autoriza ver toda la información  '
  ));
  console.log(chalk.cyan('\n  El LLM responde la pregunta completa porque el director de finanzas'));
  console.log(chalk.cyan('  tiene permisos reales en Firestore para leer las tres colecciones.\n'));
}

// ──────────────────────────────────────────────
// Punto de entrada
// ──────────────────────────────────────────────

async function main() {
  console.log(chalk.bold('\n' + '█'.repeat(65)));
  console.log(chalk.bold('  DEMO: Seguridad por Diseño en Arquitecturas LLM'));
  console.log(chalk.bold('  CRM Corporativo — Firebase + LangChain + Mistral'));
  console.log(chalk.bold('█'.repeat(65)));
  console.log(chalk.gray(`\n  Pregunta de demo:\n  "${PREGUNTA_DEMO}"\n`));

  await escenario0_antipatron();
  await escenario1_ventas();
  await escenario2_cobranza();
  await escenario3_finanzas();

  console.log(chalk.bold('\n' + '═'.repeat(65)));
  console.log(chalk.bold('  Demo finalizado'));
  console.log(chalk.bold('═'.repeat(65) + '\n'));

  // Cerrar sesión para dejar el estado limpio
  await clientAuth.signOut();
  process.exit(0);
}

main().catch((err) => {
  console.error(chalk.red('\nError en la demo:'), err.message);
  if (err.code) console.error(chalk.red('Código:'), err.code);
  process.exit(1);
});
