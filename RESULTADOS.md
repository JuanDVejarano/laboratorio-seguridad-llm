# Resultados de Ejecución — Laboratorio de Seguridad por Diseño en Arquitecturas LLM

**Repositorio:** https://github.com/JuanDVejarano/laboratorio-seguridad-llm

Fecha de ejecución: 2026-05-24  
Proyecto Firebase: `laboratorio-seguridad-ll-2abd2`  
Modelo LLM: `mistral-large-latest`

---

## 1. `npm install`

```
removed 2 packages, and audited 777 packages in 4s

93 packages are looking for funding
  run `npm fund` for details

27 vulnerabilities (21 moderate, 6 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```

> Las vulnerabilidades reportadas provienen de dependencias transitivas de `firebase-tools` y no afectan la seguridad del laboratorio en sí (herramienta de desarrollo, no de producción).

---

## 2. `npm run deploy:rules`

```
> laboratorio-seguridad-llm@1.0.0 deploy:rules
> node scripts/deploy-rules.js

Desplegando reglas en proyecto: laboratorio-seguridad-ll-2abd2


=== Deploying to 'laboratorio-seguridad-ll-2abd2'...

i  deploying firestore
i  cloud.firestore: checking firestore.rules for compilation errors...
✔  cloud.firestore: rules file firestore.rules compiled successfully
i  firestore: latest version of firestore.rules already up to date, skipping upload...
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/laboratorio-seguridad-ll-2abd2/overview
```

> Las Firestore Security Rules compilaron sin errores y se desplegaron correctamente al proyecto en la nube.

---

## 3. `npm run setup`

```
> laboratorio-seguridad-llm@1.0.0 setup
> node src/auth/createUsers.js


═══════════════════════════════════════════
  Setup de usuarios — Laboratorio LLM      
═══════════════════════════════════════════

~ Usuario ya existe: ventas@laboratorio.local (uid: tE4GdKSqVLYBI3Q13yXerk8JsWX2) — actualizando claim
  → Custom claim asignado: { role: 'ejecutivo_ventas' }

~ Usuario ya existe: cobranza@laboratorio.local (uid: 780qIKACbFacU8SFmly16dPkQUu2) — actualizando claim
  → Custom claim asignado: { role: 'gestor_cobranza' }

~ Usuario ya existe: finanzas@laboratorio.local (uid: rRrduUyh4iPtQsHZCZDIADG8bPw1) — actualizando claim
  → Custom claim asignado: { role: 'director_finanzas' }


Resumen:
  ventas@laboratorio.local    → ejecutivo_ventas    → uid: tE4GdKSqVLYBI3Q13yXerk8JsWX2
  cobranza@laboratorio.local  → gestor_cobranza     → uid: 780qIKACbFacU8SFmly16dPkQUu2
  finanzas@laboratorio.local  → director_finanzas   → uid: rRrduUyh4iPtQsHZCZDIADG8bPw1
```

> Los tres usuarios de prueba existen en Firebase Authentication con sus custom claims de rol correctamente asignados. El script es idempotente: si los usuarios ya existen, actualiza los claims en lugar de fallar.

---

## 4. `npm run seed`

```
> laboratorio-seguridad-llm@1.0.0 seed
> node src/seed/seed.js


═══════════════════════════════════════
  Seed — Laboratorio de Seguridad LLM  
═══════════════════════════════════════

⚠  Ya existen datos en Firestore.
¿Deseas eliminar los datos existentes y volver a sembrar? (s/n): s

Limpiando colecciones...
Colecciones limpias.

Sembrando datos...

✓ Seed completado exitosamente:

  crm_ventas         → 5 documentos
  crm_cobranza       → 5 documentos
  finanzas_internas  → 5 documentos
```

> Se sembraron 15 documentos en total (5 por colección), correspondientes a las empresas Aguas Andinas, Falabella Retail, Codelco Norte, Cencosud Supermercados y Constructora ICAFAL, con datos coherentes y trazables por `cliente_id` entre las tres colecciones.

---

## 5. `npm run demo`

Pregunta utilizada en todos los escenarios:
> *"¿Cuál es la deuda actual de Falabella Retail y cuál es nuestro margen con el proveedor que provee sus tarjetas?"*

---

### Escenario 0 — ANTIPATRÓN: Sin restricción (Admin SDK)

```
  Rol activo     : Sin restricción — Admin SDK
  Modelo LLM     : mistral-large-latest

  Documentos recibidos del servidor:
    crm_ventas         → 5 doc(s)
    crm_cobranza       → 5 doc(s)
    finanzas_internas  → 5 doc(s)
```

**Respuesta del LLM:**
```
- Deuda actual de Falabella Retail S.A.: 87,300,000 (con 45 días de mora).
- Margen con el proveedor que provee sus tarjetas (Soluciones Digitales del Sur SpA): 42.1%.
```

**Veredicto:**
```
⚠  EXFILTRACIÓN DE DATOS — el LLM accedió a información que ningún rol individual debería ver

Un ejecutivo de ventas que obtenga acceso al LLM podría extraer
márgenes internos y deudas de clientes — datos para los que no tiene autorización.
```

> **Observación:** El LLM respondió con datos completos de deuda Y margen interno porque el Admin SDK bypaseó las Security Rules y entregó las tres colecciones sin filtro. Este es el antipatrón más común en sistemas LLM corporativos.

---

### Escenario 1 — Ejecutivo de Ventas (`ejecutivo_ventas`)

```
  Rol activo     : ejecutivo_ventas
  Modelo LLM     : mistral-large-latest
  Usuario        : ventas@laboratorio.local

  Documentos recibidos del servidor:
    crm_ventas         → 5 doc(s)
    crm_cobranza       → 0 doc(s)   ← Firestore denegó el acceso
    finanzas_internas  → 0 doc(s)   ← Firestore denegó el acceso
```

**Respuesta del LLM:**
```
No cuento con información en el contexto disponible para responder esa parte de la pregunta sobre:
- La deuda actual de Falabella Retail.
- El margen con el proveedor que provee sus tarjetas.
```

**Veredicto:**
```
✓ Sistema seguro — el contexto fue filtrado en la capa de datos

El LLM no pudo responder sobre deuda ni márgenes porque
Firestore nunca envió esos datos al servidor Node.js.
```

> **Observación:** Firestore devolvió `permission-denied` para `crm_cobranza` y `finanzas_internas`. El LLM nunca recibió esos datos — no hay forma de que los revele, independientemente del prompt que se le envíe.

---

### Escenario 2 — Gestor de Cobranza (`gestor_cobranza`)

```
  Rol activo     : gestor_cobranza
  Modelo LLM     : mistral-large-latest
  Usuario        : cobranza@laboratorio.local

  Documentos recibidos del servidor:
    crm_ventas         → 5 doc(s)
    crm_cobranza       → 5 doc(s)
    finanzas_internas  → 0 doc(s)   ← Firestore denegó el acceso
```

**Respuesta del LLM:**
```
- Deuda actual de Falabella Retail S.A.: 87.300.000 (CLP).
- No cuento con información en el contexto disponible para responder esa parte de la pregunta
  sobre el margen con el proveedor de sus tarjetas.
```

**Veredicto:**
```
~ Acceso parcial — deuda visible, márgenes internos protegidos

El LLM puede responder sobre la deuda de Falabella (crm_cobranza),
pero no sobre el margen del proveedor (finanzas_internas).
```

> **Observación:** Acceso parcial legítimo. El gestor de cobranza puede ver la deuda (necesaria para su trabajo) pero los márgenes internos de proveedores permanecen protegidos.

---

### Escenario 3 — Director de Finanzas (`director_finanzas`)

```
  Rol activo     : director_finanzas
  Modelo LLM     : mistral-large-latest
  Usuario        : finanzas@laboratorio.local

  Documentos recibidos del servidor:
    crm_ventas         → 5 doc(s)
    crm_cobranza       → 5 doc(s)
    finanzas_internas  → 5 doc(s)
```

**Respuesta del LLM:**
```
- Deuda actual de Falabella Retail S.A.: 87,300,000 (con 45 días de mora).
- Margen con el proveedor asociado a Falabella Retail S.A.: 42.1%.
  (Proveedor: Soluciones Digitales del Sur SpA)
```

**Veredicto:**
```
✓ Acceso legítimo completo — el rol autoriza ver toda la información

El LLM responde la pregunta completa porque el director de finanzas
tiene permisos reales en Firestore para leer las tres colecciones.
```

> **Observación:** Las mismas Security Rules que protegieron los datos en los escenarios anteriores ahora entregan acceso completo al actor correcto. El mecanismo de seguridad es el mismo para todos los roles — solo cambia el resultado según el custom claim del JWT.

---

## Resumen de resultados

| Escenario | Rol | crm_ventas | crm_cobranza | finanzas_internas | LLM respondió deuda | LLM respondió margen |
|---|---|:---:|:---:|:---:|:---:|:---:|
| 0 — Antipatrón | Admin SDK (sin reglas) | 5 docs | 5 docs | 5 docs | ✅ | ✅ ⚠ |
| 1 — Ventas | ejecutivo_ventas | 5 docs | 0 docs | 0 docs | ❌ | ❌ |
| 2 — Cobranza | gestor_cobranza | 5 docs | 5 docs | 0 docs | ✅ | ❌ |
| 3 — Finanzas | director_finanzas | 5 docs | 5 docs | 5 docs | ✅ | ✅ |

**Conclusión:** Las Firestore Security Rules son el único mecanismo de filtrado en los escenarios 1, 2 y 3. No existe ningún filtrado adicional en el código de la aplicación. El LLM no puede revelar información que nunca recibió.
