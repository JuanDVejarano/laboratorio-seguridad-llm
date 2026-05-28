// Detecta PII en texto. Retorna conteos, nunca el contenido sensible.
// Principio de minimización: los logs registran {"rut": 2, "email": 1},
// no los valores reales. El contenido completo solo vive en LangSmith,
// que tiene su propia frontera de seguridad y retención controlada.

// Patrones para contexto chileno
const PATTERNS = {
  // RUT chileno: 12.345.678-9 o 12345678-9
  rut: /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g,
  // Email estándar
  email: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  // Teléfono chileno: +56 9 1234 5678 o variantes
  telefono: /(\+?56\s?)?(\(?\d{1,2}\)?\s?)?\d{4}[\s-]?\d{4}\b/g,
  // Montos grandes en pesos chilenos (indicador de datos financieros)
  monto_clp: /\$\s?\d{1,3}(\.\d{3})+/g,
};

// Analiza texto y retorna { rut: N, email: N, telefono: N, monto_clp: N, total: N }
export function detectPII(text) {
  if (!text || typeof text !== 'string') return { total: 0 };

  const counts = {};
  let total = 0;

  for (const [tipo, patron] of Object.entries(PATTERNS)) {
    const matches = text.match(patron);
    const count = matches?.length ?? 0;
    if (count > 0) {
      counts[tipo] = count;
      total += count;
    }
  }

  return { ...counts, total };
}

// Versión que analiza un objeto (lo serializa primero)
export function detectPIIInObject(obj) {
  return detectPII(JSON.stringify(obj));
}
