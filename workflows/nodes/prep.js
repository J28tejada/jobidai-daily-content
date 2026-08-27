// ============================================================================
// Preparar lote para Claude
// Dedupe -> recorte -> construcción del system/user prompt.
//
// SYSTEM_PROMPT es la copia ejecutable de prompts/generacion-ideas.md (v1).
// Si editas uno, edita el otro en el mismo commit.
// ============================================================================

const MODELO = 'claude-opus-5';   // para bajar costo: 'claude-sonnet-5'
const MAX_ITEMS = 30;             // items que se le mandan a Claude por run

const SYSTEM_PROMPT = `Eres el estratega de contenido de Josue Tejada: full-stack developer, IT admin y fundador de Jobidai.
Su marca personal es "automatización + IA aplicada a negocios reales" — no hype, no futurismo vago,
no "la IA va a cambiar el mundo". Habla desde la trinchera: cosas que él mismo implementa para
negocios pequeños y medianos en República Dominicana y LATAM.

Su audiencia son dueños de negocio, gerentes de operaciones y developers que quieren aplicar
automatización e IA a problemas concretos: facturación, inventario, WhatsApp, reportes, back office.

Recibirás una lista de items de noticias/discusiones de Hacker News, Reddit y Google News.
Para CADA item devuelve un objeto JSON con esta forma exacta:

{
  "id": "<el id que te llegó en el item, copiado tal cual>",
  "resumen": "<2-3 oraciones en español, qué pasó y por qué importa. Concreto, sin adjetivos de relleno.>",
  "angulos": [
    { "angulo": "<el enfoque del contenido, una oración>", "gancho": "<la primera línea del post, lista para publicar>" }
  ],
  "formato_sugerido": "<uno de: carrusel | hilo | video corto | post largo | newsletter>",
  "score_relevancia": <entero 0-10>,
  "descartable": <true|false>
}

Reglas:

1. **Español dominicano neutro.** Profesional pero directo. Nada de "revolucionario", "game changer",
   "el futuro es ahora". Si no puedes explicar por qué le importa a un dueño de negocio, es un 3 o menos.
2. **2 a 3 ángulos por item.** Cada ángulo distinto de verdad: no reformules el mismo enfoque.
   Los ganchos son la primera línea real del post, no una descripción del post.
3. **score_relevancia** mide qué tan aplicable es a la audiencia de Josue, no qué tan popular es
   la noticia:
   - 8-10: se puede convertir en un caso de uso implementable esta semana
   - 5-7: relevante para el sector, requiere aterrizarlo
   - 0-4: interesante pero lejano al día a día de un negocio
4. **descartable: true** para: rondas de inversión y valuaciones, drama corporativo, política de
   la industria, papers puramente académicos, lanzamientos de hardware de consumo, y cualquier
   cosa sin ángulo práctico. Un item descartable igual lleva \`resumen\`, y puede llevar \`angulos: []\`.
5. **Nunca inventes datos.** Si el título es lo único que tienes, trabaja con eso y baja el score.
   No te inventes cifras, nombres de empresas ni resultados.

Formato de salida: responde ÚNICAMENTE con el array JSON. Sin \`\`\`json, sin texto antes o después,
sin explicaciones. Un objeto por cada item recibido, en el mismo orden.`;

// --- Fecha del run, anclada a Santo Domingo -------------------------------
const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

// --- Dedupe por URL normalizada -------------------------------------------
const vistos = new Set();
const items = [];

for (const entrada of $input.all()) {
  const it = entrada.json;
  if (!it || !it.titulo) continue;

  const clave = (it.url || it.titulo)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');

  if (vistos.has(clave)) continue;
  vistos.add(clave);

  items.push({
    id: `${it.fuente}-${items.length}`,
    fuente: it.fuente,
    titulo: it.titulo,
    url: it.url || null,
    puntaje: it.puntaje ?? null,
    publicado_en: it.publicado_en || null,
    extracto: it.extracto || null,
    raw: it.raw || null,
  });
}

// Los de mayor puntaje primero; los sin puntaje (Google News) no quedan al fondo.
items.sort((a, b) => (b.puntaje ?? 50) - (a.puntaje ?? 50));
const lote = items.slice(0, MAX_ITEMS);

if (lote.length === 0) {
  throw new Error('Ninguna de las 3 fuentes devolvió items. Revisa los nodos HTTP antes de reintentar.');
}

const paraClaude = lote.map(({ id, fuente, titulo, url, puntaje, extracto }) => ({
  id, fuente, titulo, url, puntaje, extracto,
}));

const USER_PROMPT = `Fecha: ${fecha}

Items de hoy:

${JSON.stringify(paraClaude, null, 2)}`;

return [{
  json: {
    fecha,
    modelo: MODELO,
    system_prompt: SYSTEM_PROMPT,
    user_prompt: USER_PROMPT,
    items: lote,          // se re-usa en "Parsear respuesta IA" para reunir con la respuesta
    total_items: lote.length,
  },
}];
