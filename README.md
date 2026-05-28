# Laboratorio de Seguridad por Diseño en Arquitecturas LLM

**Repositorio:** https://github.com/JuanDVejarano/laboratorio-seguridad-llm

Proyecto educativo en Node.js que demuestra empíricamente, frente a una clase, que un sistema con LLM es **inseguro por defecto si la arquitectura de datos no restringe el acceso por rol**.

## ¿Qué demuestra este laboratorio?

Ejecuta 4 escenarios con la **misma pregunta** al mismo LLM:

| Escenario | Actor | Resultado |
|---|---|---|
| 0 — Antipatrón | Admin SDK (sin restricción) | LLM revela datos de todos los roles ⚠ |
| 1 — Seguro | Ejecutivo de ventas | LLM no puede responder sobre deuda ni márgenes ✓ |
| 2 — Parcial | Gestor de cobranza | LLM ve deuda, pero no márgenes internos ~ |
| 3 — Completo | Director de finanzas | LLM responde todo (acceso legítimo) ✓ |

El filtrado ocurre en las **Firestore Security Rules** — no en el prompt ni en el código de aplicación.

---

## Pasos previos en Firebase Console

Antes de ejecutar el proyecto, realiza estos pasos en [console.firebase.google.com](https://console.firebase.google.com):

### 1. Crear un proyecto Firebase
- Ir a Firebase Console → "Agregar proyecto"
- Asignar un nombre (ej. `laboratorio-seguridad-llm`)
- Puedes desactivar Google Analytics para este laboratorio

### 2. Habilitar Authentication con Email/Password
- Panel lateral → **Authentication** → **Sign-in method**
- Activar el proveedor **Correo electrónico/contraseña**
- Guardar

### 3. Crear base de datos Firestore en modo producción
- Panel lateral → **Firestore Database** → "Crear base de datos"
- Seleccionar **Modo de producción** (las reglas restrictivas son el punto central del lab)
- Elegir una región (ej. `us-central1`)

### 4. Generar Service Account Key (Admin SDK)
- **Configuración del proyecto** (ícono ⚙) → pestaña **Cuentas de servicio**
- Seleccionar **Node.js** → clic en **Generar nueva clave privada**
- Se descarga un archivo `.json` — guárdalo fuera del repositorio

### 5. Registrar una Web App y copiar configuración pública
- **Configuración del proyecto** → pestaña **General** → sección "Tus apps"
- Clic en el ícono `</>` (Web)
- Asignar un alias (ej. `demo-crm`) — **no** habilitar Firebase Hosting
- Copiar los valores de `apiKey`, `authDomain` y `appId`

### 6. Obtener API Key de Mistral
- Ir a [console.mistral.ai](https://console.mistral.ai/) y generar una API key

---

## Configuración del entorno

```bash
cp .env.example .env
```

Edita `.env` con los valores obtenidos en los pasos anteriores:

```dotenv
FIREBASE_PROJECT_ID=tu-proyecto-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@tu-proyecto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
FIREBASE_APP_ID=1:123456789:web:abc123

MISTRAL_API_KEY=tu_clave_de_mistral
LLM_MODEL=mistral-large-latest
```

> **Importante con `FIREBASE_PRIVATE_KEY`:** copia el valor completo del campo `"private_key"` del JSON de la service account, incluyendo las comillas. Debe quedar en una sola línea con `\n` literales.

---

## Capa de Observabilidad

El proyecto usa dos capas de observabilidad complementarias:

| Capa | Herramienta | Qué observa |
|------|-------------|-------------|
| LLM | LangSmith | Prompts enviados, respuestas del modelo, tokens, metadatos por rol |
| Backend | Better Stack | Eventos del sistema, accesos denegados, PII detectada, correlation IDs |

Ambas capas se conectan mediante el `correlation_id`: un UUID generado por escenario que aparece como campo en los logs de Better Stack y como `metadata.correlation_id` en las trazas de LangSmith.

### Configurar LangSmith

1. Crear cuenta gratuita en [smith.langchain.com](https://smith.langchain.com)
2. Ir a **Settings → API Keys → Create API Key**
3. Copiar el valor en `LANGCHAIN_API_KEY` del `.env`
4. Definir un nombre de proyecto en `LANGCHAIN_PROJECT` (ej: `laboratorio-seguridad-llm`)
5. Asegurarse de que `LANGCHAIN_TRACING_V2=true`

Una vez configurado, cada ejecución de `npm run demo` genera trazas automáticamente en LangSmith. Para filtrar por escenario, usar el campo `metadata.rol` o `metadata.correlation_id`.

### Configurar Better Stack

1. Crear cuenta gratuita en [logs.betterstack.com](https://logs.betterstack.com)
2. Ir a **Sources → Create source → Node.js**
3. Copiar el **Source token** en `BETTERSTACK_SOURCE_TOKEN` del `.env`

Los logs incluyen campos estructurados como `event`, `rol`, `coleccion`, `correlation_id`, `pii_counts`, `control_rbac`. Usar el buscador de Better Stack para filtrar por cualquiera de ellos.

### Preguntas que la observabilidad puede responder

Dado un `correlation_id` de cualquier escenario:
- **¿Qué vio exactamente el LLM?** → LangSmith, filtrar por `metadata.correlation_id`
- **¿Qué colecciones se leyeron y cuáles fueron denegadas?** → Better Stack, filtrar por `correlation_id` + `event = firestore.acceso_denegado`
- **¿Hubo PII en la respuesta del LLM?** → Better Stack, filtrar por `event = llm.invocacion_completada` + `pii_en_respuesta.total > 0`

---

## Instalación y ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Instalar Firebase CLI globalmente (si no lo tienes)
npm install -g firebase-tools
firebase login

# 3. Desplegar las Security Rules a Firestore
npm run deploy:rules

# 4. Crear los tres usuarios de prueba con sus roles
npm run setup

# 5. Poblar Firestore con datos de demostración
npm run seed

# 6. Ejecutar la demo completa
npm run demo
```

**Tiempo estimado desde cero: < 15 minutos.**

---

## Estructura del proyecto

```
laboratorio-seguridad-llm/
├── .env.example          # Plantilla de variables de entorno
├── firestore.rules       # Reglas de seguridad — corazón pedagógico del lab
├── firebase.json         # Configuración para firebase-tools
├── src/
│   ├── config/
│   │   ├── admin.js      # Firebase Admin SDK (bypasea reglas)
│   │   └── client.js     # Firebase Web SDK (respeta reglas)
│   ├── seed/
│   │   └── seed.js       # Datos de prueba — 5 empresas chilenas
│   ├── auth/
│   │   ├── createUsers.js    # Crea usuarios con custom claims de rol
│   │   └── getCustomToken.js # Autenticación y obtención de ID token
│   ├── llm/
│   │   └── askLLM.js     # Wrapper LangChain + Mistral
│   └── demo/
│       └── runDemo.js    # Script principal — 4 escenarios
└── docs/
    └── guia-clase.md     # Guía para el docente
```

---

## Roles y acceso a colecciones

| Rol | `crm_ventas` | `crm_cobranza` | `finanzas_internas` |
|---|:---:|:---:|:---:|
| `ejecutivo_ventas` | ✅ | ❌ | ❌ |
| `gestor_cobranza` | ✅ | ✅ | ❌ |
| `director_finanzas` | ✅ | ✅ | ✅ |

---

## Troubleshooting frecuente

**`FIREBASE_PRIVATE_KEY` inválida** → Verifica que la clave esté entre comillas dobles en `.env` y contenga `\n` literales (no saltos de línea reales).

**`permission-denied` en todos los escenarios** → Ejecuta `npm run deploy:rules` para desplegar las Security Rules actualizadas.

**`auth/email-already-exists`** → Normal; el script actualiza los custom claims del usuario existente.

**El LLM alucina datos** → Verifica que `temperature: 0` esté configurado en `askLLM.js` y que el modelo elegido soporte instrucciones estrictas.
