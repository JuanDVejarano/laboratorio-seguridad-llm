import pino from 'pino';
import { Logtail } from '@logtail/node';
import { getCorrelationId } from './correlationId.js';
import 'dotenv/config';

// Inicializa el cliente de Better Stack solo si el token está configurado.
// Si no está configurado (desarrollo sin cuenta), los logs solo van a stdout.
const logtail = process.env.BETTERSTACK_SOURCE_TOKEN
  ? new Logtail(process.env.BETTERSTACK_SOURCE_TOKEN)
  : null;

// Transport dual: pretty para consola, JSON para Better Stack
const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      level: 'debug',
    },
  ],
});

const pinoLogger = pino({ level: 'debug' }, transport);

// Enriquece cada evento con correlation_id, servicio y ambiente.
// Este es el "procesador" equivalente al structlog de Python.
function enrichLog(level, event, fields = {}) {
  const correlationId = getCorrelationId();
  const enriched = {
    event,
    service: 'laboratorio-seguridad-llm',
    environment: process.env.NODE_ENV ?? 'development',
    ...(correlationId ? { correlation_id: correlationId } : {}),
    ...fields,
  };

  // Emite en consola via pino
  pinoLogger[level](enriched, event);

  // Envía a Better Stack si está configurado (sin await para no bloquear el flujo)
  if (logtail) {
    logtail[level](event, enriched).catch(() => {
      // Silencia errores de red para no interrumpir la demo
    });
  }
}

// API pública del logger: info, warn, error
// Uso: logger.info('escenario.iniciado', { rol: 'ejecutivo_ventas', ... })
export const logger = {
  info: (event, fields) => enrichLog('info', event, fields),
  warn: (event, fields) => enrichLog('warn', event, fields),
  error: (event, fields) => enrichLog('error', event, fields),
};

// Fuerza el flush de logs pendientes en Better Stack antes de que el proceso termine.
// Llámalo al final del demo para garantizar que todos los eventos llegaron.
export async function flushLogs() {
  if (logtail) await logtail.flush();
}
