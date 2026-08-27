const fs = require('fs');
const path = require('path');
const N = f => fs.readFileSync(path.join(__dirname, '..', 'workflows', 'nodes', f), 'utf8');

const code = (name, file, pos, notes) => ({
  parameters: { jsCode: N(file) },
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: pos,
  ...(notes ? { notes, notesInFlow: false } : {}),
});

const RSS_URL =
  'https://news.google.com/rss/search?q=(inteligencia+artificial+OR+automatizaci%C3%B3n+OR+%22IA+para+empresas%22)+when:1d&hl=es-419&gl=DO&ceid=DO:es-419';

const REDDIT_URL =
  'https://www.reddit.com/r/artificial+automation+SaaS+smallbusiness+n8n/top.json?t=day&limit=25';

const HN_URL =
  'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30';

// Body de Gemini generateContent. responseMimeType: application/json obliga al
// modelo a devolver JSON puro, que es justo lo que espera "Parsear respuesta IA".
const geminiBody =
  '={{ JSON.stringify({' +
  ' system_instruction: { parts: [ { text: $json.system_prompt } ] },' +
  ' contents: [ { role: "user", parts: [ { text: $json.user_prompt } ] } ],' +
  ' generationConfig: { temperature: 0.7, maxOutputTokens: 32768, responseMimeType: "application/json" }' +
  ' }) }}';

const nodes = [
  {
    parameters: {
      rule: { interval: [{ triggerAtHour: 7, triggerAtMinute: 0 }] },
    },
    id: 'cron-7am',
    name: 'Cron 7am',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [-240, 300],
    notes:
      'Dispara a las 7:00 en la TIMEZONE DE LA INSTANCIA de n8n, no la del workflow. ' +
      'Verificar Settings -> Timezone = America/Santo_Domingo.',
  },

  // ---------------- Fuente 1: Hacker News ----------------
  {
    parameters: {
      url: HN_URL,
      options: { timeout: 30000, response: { response: { neverError: false } } },
    },
    id: 'hn-front-page',
    name: 'HN - Front page',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [0, 60],
  },
  code('Normalizar HN', 'norm_hn.js', [220, 60]),

  // ---------------- Fuente 2: Reddit ----------------
  {
    parameters: {
      url: REDDIT_URL,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'User-Agent', value: 'jobidai-daily-content/1.0 (n8n; contacto: josue)' },
        ],
      },
      options: { timeout: 30000 },
    },
    id: 'reddit-top-dia',
    name: 'Reddit - Top del día',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [0, 300],
    notes:
      'Reddit devuelve 429 si el User-Agent es genérico. No quitar el header. ' +
      'Si empieza a fallar seguido, cambiar a la API OAuth de Reddit.',
  },
  code('Normalizar Reddit', 'norm_reddit.js', [220, 300]),

  // ---------------- Fuente 3: Google News ----------------
  {
    parameters: { url: RSS_URL, options: {} },
    id: 'google-news-rss',
    name: 'Google News - RSS',
    type: 'n8n-nodes-base.rssFeedRead',
    typeVersion: 1.1,
    position: [0, 540],
  },
  code('Normalizar Google News', 'norm_gnews.js', [220, 540]),

  // ---------------- Unión ----------------
  {
    parameters: { numberInputs: 3, options: {} },
    id: 'unir-todas-las-fuentes',
    name: 'Unir todas las fuentes',
    type: 'n8n-nodes-base.merge',
    typeVersion: 3,
    position: [460, 300],
    notes:
      'DEBE tener 3 inputs. Si al importar aparece con 2, ajustar "Number of Inputs" a 3 ' +
      'y reconectar el normalizador que quedó suelto.',
  },

  code(
    'Preparar lote para el modelo',
    'prep.js',
    [680, 300],
    'Aquí vive SYSTEM_PROMPT (copia de prompts/generacion-ideas.md v1) y el modelo. Mantener sincronizado.'
  ),

  // ---------------- Gemini ----------------
  {
    parameters: {
      method: 'POST',
      url: '=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.modelo }}:generateContent',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'content-type', value: 'application/json' }],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: geminiBody,
      options: { timeout: 300000 },
    },
    id: 'gemini-generar-angulos',
    name: 'Gemini - Generar ángulos',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [900, 300],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    notes:
      'Credencial: Header Auth "Gemini API" -> Name: x-goog-api-key, Value: la API key. ' +
      'El modelo sale de $json.modelo (workflows/nodes/prep.js), no se hardcodea aquí. ' +
      'El system prompt tampoco se edita aquí: viene de $json.system_prompt.',
  },

  code('Parsear respuesta IA', 'parse.js', [1120, 300]),

  // ---------------- Supabase ----------------
  {
    parameters: {
      tableId: 'ideas_diarias',
      dataToSend: 'autoMapInputData',
      options: {},
    },
    id: 'guardar-en-supabase',
    name: 'Guardar en Supabase',
    type: 'n8n-nodes-base.supabase',
    typeVersion: 1,
    position: [1340, 300],
    onError: 'continueRegularOutput',
    notes:
      'Credencial: "Supabase - ideas_diarias" con la SERVICE_ROLE key (la anon no pasa RLS). ' +
      'onError=continue: un duplicado (unique fecha+url_hash) no debe matar la corrida.',
  },

  code('Formatear mensaje', 'format_msg.js', [1560, 300]),

  // ---------------- WhatsApp ----------------
  {
    parameters: {},
    id: 'enviar-por-whatsapp',
    name: 'Enviar por WhatsApp',
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position: [1780, 300],
    notes:
      'PLACEHOLDER. Reemplazar por el nodo real del bot de WhatsApp de Jobidai, ' +
      'usando {{ $json.mensaje }} como texto. Ver scripts/setup.md paso 4.',
  },
];

const conn = (from, to, index = 0) => ({ [from]: { main: [[{ node: to, type: 'main', index }]] } });

const connections = {
  'Cron 7am': {
    main: [[
      { node: 'HN - Front page', type: 'main', index: 0 },
      { node: 'Reddit - Top del día', type: 'main', index: 0 },
      { node: 'Google News - RSS', type: 'main', index: 0 },
    ]],
  },
  ...conn('HN - Front page', 'Normalizar HN'),
  ...conn('Reddit - Top del día', 'Normalizar Reddit'),
  ...conn('Google News - RSS', 'Normalizar Google News'),
  ...conn('Normalizar HN', 'Unir todas las fuentes', 0),
  ...conn('Normalizar Reddit', 'Unir todas las fuentes', 1),
  ...conn('Normalizar Google News', 'Unir todas las fuentes', 2),
  ...conn('Unir todas las fuentes', 'Preparar lote para el modelo'),
  ...conn('Preparar lote para el modelo', 'Gemini - Generar ángulos'),
  ...conn('Gemini - Generar ángulos', 'Parsear respuesta IA'),
  ...conn('Parsear respuesta IA', 'Guardar en Supabase'),
  ...conn('Guardar en Supabase', 'Formatear mensaje'),
  ...conn('Formatear mensaje', 'Enviar por WhatsApp'),
};

const workflow = {
  name: 'Ideas Diarias',
  nodes,
  connections,
  active: false,
  settings: {
    executionOrder: 'v1',
    timezone: 'America/Santo_Domingo',
    saveManualExecutions: true,
  },
  tags: [],
  pinData: {},
};


fs.writeFileSync((process.argv[2] || path.join(__dirname, '..', 'workflows', 'ideas-diarias.json')), JSON.stringify(workflow, null, 2) + '\n');
console.log('escrito:', (process.argv[2] || path.join(__dirname, '..', 'workflows', 'ideas-diarias.json')));
