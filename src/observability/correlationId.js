// Equivalente a contextvars de Python: cada "request" o escenario
// tiene su propio contexto aislado con un correlation_id único.
// Cualquier función async que corra dentro del mismo almacenamiento
// puede leer el ID con getCorrelationId() sin recibirlo como parámetro.
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

const storage = new AsyncLocalStorage();

// Ejecuta una función dentro de un nuevo contexto con su propio correlation_id.
// fn: función async a ejecutar
// customId: opcional, si se quiere forzar un ID específico (útil para tests)
export function runWithCorrelationId(fn, customId = null) {
  const id = customId ?? randomUUID();
  return storage.run({ correlationId: id }, fn);
}

// Lee el correlation_id del contexto actual.
// Retorna null si se llama fuera de un contexto (ej: en código de setup).
export function getCorrelationId() {
  return storage.getStore()?.correlationId ?? null;
}
