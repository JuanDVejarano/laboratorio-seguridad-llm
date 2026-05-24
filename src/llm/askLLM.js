import { ChatMistralAI } from '@langchain/mistralai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import 'dotenv/config';

// Instanciar el modelo una sola vez (singleton).
// temperature: 0 hace al modelo determinista — la misma entrada siempre produce
// la misma salida, lo que hace la demo reproducible entre ejecuciones en clase.
const model = new ChatMistralAI({
  apiKey: process.env.MISTRAL_API_KEY,
  model: process.env.LLM_MODEL,
  temperature: 0,
});

// El prompt del sistema es conservador a propósito:
// fuerza al modelo a declarar explícitamente cuando le falta información.
// Si el modelo alucinara datos que no están en el contexto, la lección pedagógica
// se perdería — el alumno no vería la diferencia entre escenarios seguros e inseguros.
const promptTemplate = ChatPromptTemplate.fromMessages([
  [
    'system',
    `Eres un asistente de análisis de negocio.
Responde ÚNICAMENTE con base en el contexto JSON proporcionado.
Si no tienes información suficiente para responder alguna parte, di explícitamente:
"No cuento con información en el contexto disponible para responder esa parte de la pregunta."
Bajo ninguna circunstancia inventes datos ni hagas suposiciones.`,
  ],
  ['human', 'Contexto disponible:\n{context}\n\nPregunta: {question}'],
]);

// Cadena compuesta con el patrón central de LangChain: prompt → modelo → parser.
// Cada eslabón transforma la salida del anterior:
//   1. promptTemplate formatea las variables en mensajes de chat
//   2. model invoca la API de Mistral y retorna un AIMessage
//   3. StringOutputParser extrae el texto plano del AIMessage
const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

// Recibe el contexto de datos (objeto JS) y la pregunta del usuario,
// serializa el contexto como JSON indentado para que el modelo lo pueda leer,
// e invoca la cadena LangChain.
export async function askLLM(context, question) {
  return await chain.invoke({
    context: JSON.stringify(context, null, 2),
    question,
  });
}
