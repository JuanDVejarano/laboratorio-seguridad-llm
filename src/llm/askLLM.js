import { ChatMistralAI } from '@langchain/mistralai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getCorrelationId } from '../observability/correlationId.js';
import { detectPII, detectPIIInObject } from '../observability/piiDetector.js';
import { logger } from '../observability/logger.js';
import 'dotenv/config';

// askLLM recibe ahora un tercer argumento opcional con metadatos del escenario.
// Estos metadatos se pasan a LangSmith como campos consultables en la traza,
// y también se usan para enriquecer los logs de Better Stack.
export async function askLLM(context, question, scenarioMeta = {}) {
  const model = new ChatMistralAI({
    apiKey: process.env.MISTRAL_API_KEY,
    model: process.env.LLM_MODEL,
    // temperature: 0 hace al modelo determinista — la misma entrada siempre produce
    // la misma salida, lo que hace la demo reproducible entre ejecuciones en clase.
    temperature: 0,
  });

  const promptTemplate = ChatPromptTemplate.fromMessages([
    [
      'system',
      `Eres un asistente corporativo de análisis de datos.
Responde ÚNICAMENTE con base en el contexto JSON proporcionado.
Si el contexto no contiene información suficiente para responder alguna parte de la pregunta,
indica explícitamente: "No cuento con información en el contexto disponible para responder esa parte."
Bajo ninguna circunstancia inventes datos, montos, nombres o condiciones que no estén en el contexto.`,
    ],
    [
      'human',
      `Contexto disponible:
{context}

Pregunta: {question}`,
    ],
  ]);

  const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

  // Detecta PII en el contexto antes de enviarlo al LLM (punto 1 de detección)
  const piiEnInput = detectPIIInObject(context);

  // Metadatos que aparecerán en LangSmith como campos filtrables.
  // Son la "firma" de observabilidad de cada invocación al modelo.
  const correlationId = getCorrelationId();
  const langsmithMetadata = {
    ...(correlationId ? { correlation_id: correlationId } : {}),
    ...scenarioMeta,
    pii_en_contexto: piiEnInput,
    modelo_usado: process.env.LLM_MODEL,
  };

  logger.info('llm.invocacion_iniciada', {
    ...langsmithMetadata,
    tokens_contexto_aprox: JSON.stringify(context).length,
  });

  // El segundo argumento de chain.invoke() es el RunnableConfig.
  // LangSmith lo lee automáticamente para enriquecer la traza del run.
  const response = await chain.invoke(
    { context: JSON.stringify(context, null, 2), question },
    { metadata: langsmithMetadata, tags: [scenarioMeta.rol ?? 'sin-rol', 'demo'] }
  );

  // Detecta PII en la respuesta del LLM (punto 2 de detección)
  const piiEnOutput = detectPII(response);

  logger.info('llm.invocacion_completada', {
    ...langsmithMetadata,
    pii_en_respuesta: piiEnOutput,
    // Registra si hubo PII en la respuesta como advertencia (no el contenido)
    ...(piiEnOutput.total > 0
      ? { alerta: 'pii_detectada_en_respuesta' }
      : {}),
  });

  return response;
}
