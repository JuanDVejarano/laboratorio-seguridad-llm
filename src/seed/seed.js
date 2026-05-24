import { adminDb } from '../config/admin.js';
import chalk from 'chalk';
import readline from 'readline';

// ──────────────────────────────────────────────
// Datos de prueba: 5 clientes chilenos reales
// Los cliente_id son la clave que une las tres
// colecciones — permiten rastrear cada empresa
// a través de los distintos niveles de acceso.
// ──────────────────────────────────────────────

const ventasData = [
  {
    cliente_id: 'CLI-001',
    empresa: 'Aguas Andinas S.A.',
    ejecutivo_asignado: 'Valentina Rojas',
    monto_venta: 48500000,
    estado_pipeline: 'Negociación',
    fecha_cierre_estimada: '2026-07-15',
  },
  {
    cliente_id: 'CLI-002',
    empresa: 'Falabella Retail S.A.',
    ejecutivo_asignado: 'Andrés Pizarro',
    monto_venta: 125000000,
    estado_pipeline: 'Propuesta enviada',
    fecha_cierre_estimada: '2026-06-30',
  },
  {
    cliente_id: 'CLI-003',
    empresa: 'Codelco Norte',
    ejecutivo_asignado: 'Claudia Muñoz',
    monto_venta: 310000000,
    estado_pipeline: 'Contrato firmado',
    fecha_cierre_estimada: '2026-05-01',
  },
  {
    cliente_id: 'CLI-004',
    empresa: 'Cencosud Supermercados S.A.',
    ejecutivo_asignado: 'Felipe Vargas',
    monto_venta: 87000000,
    estado_pipeline: 'Prospecto calificado',
    fecha_cierre_estimada: '2026-09-20',
  },
  {
    cliente_id: 'CLI-005',
    empresa: 'Constructora ICAFAL S.A.',
    ejecutivo_asignado: 'Mariana Contreras',
    monto_venta: 62000000,
    estado_pipeline: 'Negociación',
    fecha_cierre_estimada: '2026-08-10',
  },
];

const cobranzaData = [
  {
    cliente_id: 'CLI-001',
    empresa: 'Aguas Andinas S.A.',
    deuda_total: 12400000,
    dias_mora: 15,
    condiciones_pactadas: 'Pago en 2 cuotas mensuales',
    ultimo_pago: '2026-04-10',
  },
  {
    cliente_id: 'CLI-002',
    empresa: 'Falabella Retail S.A.',
    deuda_total: 87300000,
    dias_mora: 45,
    condiciones_pactadas: 'Plan de pago 90 días, sin interés',
    ultimo_pago: '2026-03-01',
  },
  {
    cliente_id: 'CLI-003',
    empresa: 'Codelco Norte',
    deuda_total: 5200000,
    dias_mora: 0,
    condiciones_pactadas: 'Al día — pago automático',
    ultimo_pago: '2026-05-01',
  },
  {
    cliente_id: 'CLI-004',
    empresa: 'Cencosud Supermercados S.A.',
    deuda_total: 194500000,
    dias_mora: 62,
    condiciones_pactadas: 'En proceso de renegociación',
    ultimo_pago: '2026-02-28',
  },
  {
    cliente_id: 'CLI-005',
    empresa: 'Constructora ICAFAL S.A.',
    deuda_total: 31800000,
    dias_mora: 20,
    condiciones_pactadas: 'Pago diferido a 60 días por obra en curso',
    ultimo_pago: '2026-04-15',
  },
];

const finanzasData = [
  {
    cliente_id: 'CLI-001',
    empresa: 'Aguas Andinas S.A.',
    proveedor_nombre: 'Tecnosistemas Ltda.',
    proveedor_rut: '76.543.210-K',
    costo_interno: 28100000,
    margen_porcentaje: 42.1,
    condiciones_pago_proveedor: 'Net 30 días',
  },
  {
    cliente_id: 'CLI-002',
    empresa: 'Falabella Retail S.A.',
    proveedor_nombre: 'Soluciones Digitales del Sur SpA',
    proveedor_rut: '77.891.234-5',
    costo_interno: 72400000,
    margen_porcentaje: 42.1,
    condiciones_pago_proveedor: 'Net 45 días con descuento 2% pronto pago',
  },
  {
    cliente_id: 'CLI-003',
    empresa: 'Codelco Norte',
    proveedor_nombre: 'Mindata Ingeniería S.A.',
    proveedor_rut: '96.112.345-8',
    costo_interno: 198000000,
    margen_porcentaje: 36.1,
    condiciones_pago_proveedor: 'Net 60 días',
  },
  {
    cliente_id: 'CLI-004',
    empresa: 'Cencosud Supermercados S.A.',
    proveedor_nombre: 'Retail Tech Consulting Ltda.',
    proveedor_rut: '78.234.567-3',
    costo_interno: 54300000,
    margen_porcentaje: 37.6,
    condiciones_pago_proveedor: 'Net 30 días',
  },
  {
    cliente_id: 'CLI-005',
    empresa: 'Constructora ICAFAL S.A.',
    proveedor_nombre: 'Construcción Digital SpA',
    proveedor_rut: '76.987.654-2',
    costo_interno: 41000000,
    margen_porcentaje: 33.9,
    condiciones_pago_proveedor: 'Pago contra entrega de informes',
  },
];

// ──────────────────────────────────────────────
// Utilidades de consola
// ──────────────────────────────────────────────

function preguntarUsuario(pregunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(pregunta, (respuesta) => {
      rl.close();
      resolve(respuesta.trim().toLowerCase());
    });
  });
}

async function coleccionTieneDatos(nombreColeccion) {
  const snap = await adminDb.collection(nombreColeccion).limit(1).get();
  return !snap.empty;
}

async function limpiarColeccion(nombreColeccion) {
  const snap = await adminDb.collection(nombreColeccion).get();
  const lote = adminDb.batch();
  snap.docs.forEach((doc) => lote.delete(doc.ref));
  await lote.commit();
}

async function sembrarColeccion(nombreColeccion, datos) {
  const lote = adminDb.batch();
  datos.forEach((doc) => {
    const ref = adminDb.collection(nombreColeccion).doc(doc.cliente_id);
    lote.set(ref, doc);
  });
  await lote.commit();
  return datos.length;
}

// ──────────────────────────────────────────────
// Script principal
// ──────────────────────────────────────────────

async function main() {
  console.log(chalk.bold('\n═══════════════════════════════════════'));
  console.log(chalk.bold('  Seed — Laboratorio de Seguridad LLM  '));
  console.log(chalk.bold('═══════════════════════════════════════\n'));

  // Verificar si ya existen datos (idempotencia)
  const hayDatos = await coleccionTieneDatos('crm_ventas');

  if (hayDatos) {
    console.log(chalk.yellow('⚠  Ya existen datos en Firestore.'));
    const respuesta = await preguntarUsuario(
      chalk.yellow('¿Deseas eliminar los datos existentes y volver a sembrar? (s/n): ')
    );

    if (respuesta !== 's') {
      console.log(chalk.gray('\nOperación cancelada. Los datos existentes no fueron modificados.\n'));
      process.exit(0);
    }

    console.log(chalk.gray('\nLimpiando colecciones...'));
    await Promise.all([
      limpiarColeccion('crm_ventas'),
      limpiarColeccion('crm_cobranza'),
      limpiarColeccion('finanzas_internas'),
    ]);
    console.log(chalk.gray('Colecciones limpias.\n'));
  }

  console.log(chalk.cyan('Sembrando datos...\n'));

  const [nVentas, nCobranza, nFinanzas] = await Promise.all([
    sembrarColeccion('crm_ventas', ventasData),
    sembrarColeccion('crm_cobranza', cobranzaData),
    sembrarColeccion('finanzas_internas', finanzasData),
  ]);

  console.log(chalk.green('✓ Seed completado exitosamente:\n'));
  console.log(chalk.green(`  crm_ventas         → ${nVentas} documentos`));
  console.log(chalk.green(`  crm_cobranza       → ${nCobranza} documentos`));
  console.log(chalk.green(`  finanzas_internas  → ${nFinanzas} documentos`));
  console.log();
}

main().catch((err) => {
  console.error(chalk.red('Error durante el seed:'), err.message);
  process.exit(1);
});
