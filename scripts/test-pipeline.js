const { runCode } = require('./harness');
const assert = require('assert');

let fallos = 0;
const check = (msg, fn) => {
  try { fn(); console.log(`  ok   ${msg}`); }
  catch (e) { console.log(`  FALLO ${msg}\n       ${e.message}`); fallos++; }
};

// ---------- Fixtures con el shape real de cada API ----------
const hn = { hits: [
  { objectID: '1', title: 'Show HN: Self-hosted workflow automation', url: 'https://ejemplo.com/a', points: 320, created_at: '2026-08-27T09:00:00Z', story_text: '<p>Texto <b>con</b> html</p>' },
  { objectID: '2', title: 'Ask HN: automating invoicing for SMBs', points: 140, created_at: '2026-08-27T08:00:00Z' },
  { objectID: '3', url: 'https://ejemplo.com/sin-titulo', points: 10 },  // sin titulo -> se descarta
]};
const reddit = { data: { children: [
  { data: { title: 'Anuncio fijado', stickied: true, permalink: '/r/x/1', score: 999, created_utc: 1756288800 } },
  { data: { title: 'Automaticé la facturación de mi negocio con n8n', permalink: '/r/automation/2', url_overridden_by_dest: 'https://ejemplo.com/b', score: 210, created_utc: 1756288800, selftext: 'Les cuento cómo.', subreddit: 'automation', num_comments: 40 } },
  { data: { title: 'Duplicado por URL', permalink: '/r/x/3', url_overridden_by_dest: 'https://EJEMPLO.com/a/?utm_source=x', score: 88, created_utc: 1756288800, subreddit: 'x' } },
]}};
const gnews = [
  { title: 'Nueva herramienta de IA para pymes - Diario Libre', link: 'https://ejemplo.com/c', isoDate: '2026-08-27T07:00:00Z', contentSnippet: '<a href="#">Resumen</a> del articulo' },
];

console.log('Normalizadores');
const nHN = runCode('norm_hn.js', [hn]);
const nRD = runCode('norm_reddit.js', [reddit]);
const nGN = runCode('norm_gnews.js', gnews);
check('HN descarta items sin titulo', () => assert.equal(nHN.length, 2));
check('HN arma url de discusion si no hay url', () => assert.match(nHN[1].url, /news\.ycombinator\.com\/item\?id=2/));
check('HN limpia html del extracto', () => assert.equal(nHN[0].extracto, 'Texto con html'));
check('Reddit ignora los stickied', () => assert.equal(nRD.length, 2));
check('Reddit convierte created_utc a ISO', () => assert.equal(nRD[0].publicado_en, new Date(1756288800 * 1000).toISOString()));
check('Google News quita " - Medio" del titulo', () => assert.equal(nGN[0].titulo, 'Nueva herramienta de IA para pymes'));
check('Google News limpia html', () => assert.equal(nGN[0].extracto, 'Resumen del articulo'));

console.log('\nPreparar lote (dedupe + prompts)');
const lote = runCode('prep.js', [...nHN, ...nRD, ...nGN])[0];
check('dedupe por url normalizada (mayusculas/utm/slash)', () => assert.equal(lote.total_items, 4));
check('ordena por puntaje desc', () => assert.equal(lote.items[0].puntaje, 320));
check('los 3 fuentes sobreviven', () => assert.deepEqual(
  [...new Set(lote.items.map(i => i.fuente))].sort(), ['google_news', 'hackernews', 'reddit']));
check('system prompt embebido no vacio', () => assert.ok(lote.system_prompt.length > 1500));
check('user prompt lleva fecha y items', () => assert.match(lote.user_prompt, /^Fecha: \d{4}-\d{2}-\d{2}/));
check('modelo definido', () => assert.equal(lote.modelo, 'claude-opus-5'));

console.log('\nParsear respuesta IA — camino feliz');
const respuestaOK = { content: [{ type: 'text', text: '```json\n' + JSON.stringify(
  lote.items.map((it, i) => ({
    id: it.id,
    resumen: `Resumen ${i}`,
    angulos: [{ angulo: `Angulo ${i}`, gancho: `Gancho ${i}` }, { angulo: '', gancho: '' }],
    formato_sugerido: 'carrusel',
    score_relevancia: i === 0 ? 99 : 7,     // 99 debe recortarse a 10
    descartable: i === 3,
  }))) + '\n```' }] };
const filas = runCode('parse.js', [respuestaOK], { 'Preparar lote para Claude': [lote] });
check('una fila por item', () => assert.equal(filas.length, lote.total_items));
check('tolera el envoltorio ```json', () => assert.equal(filas[0].resumen, 'Resumen 0'));
check('recorta score fuera de rango a 0-10', () => assert.equal(filas[0].score_relevancia, 10));
check('descarta angulos vacios', () => assert.equal(filas[0].angulos.length, 1));
check('respeta descartable', () => assert.equal(filas[3].descartable, true));
check('sin error en camino feliz', () => assert.ok(filas.every(f => f.error === null)));

const COLS = ['fecha','fuente','titulo','url','puntaje','publicado_en','resumen','angulos',
              'formato_sugerido','score_relevancia','descartable','error','raw'];
check('columnas == schema (sin id/url_hash/created_at)', () =>
  assert.deepEqual(Object.keys(filas[0]).sort(), [...COLS].sort()));

console.log('\nParsear respuesta IA — respuesta rota');
const roto = runCode('parse.js', [{ content: [{ type: 'text', text: 'Perdón, no puedo hacer eso.' }] }],
  { 'Preparar lote para Claude': [lote] });
check('no lanza; marca parse_error', () => assert.ok(roto.every(f => f.error === 'parse_error')));
check('marca descartable en fallo', () => assert.ok(roto.every(f => f.descartable === true)));
check('conserva titulo y url para diagnostico', () => assert.equal(roto[0].titulo, filas[0].titulo));

console.log('\nFormatear mensaje');
const msg = runCode('format_msg.js', [{}], { 'Parsear respuesta IA': filas })[0];
check('incluye la fecha', () => assert.match(msg.mensaje, /Ideas del día — \d{4}-\d{2}-\d{2}/));
check('excluye descartables del top', () => assert.ok(!msg.mensaje.includes(filas[3].titulo)));
check('incluye ganchos', () => assert.match(msg.mensaje, /Gancho 0/));
check('cuenta destacadas', () => assert.equal(msg.destacadas, 3));
const msgRoto = runCode('format_msg.js', [{}], { 'Parsear respuesta IA': roto })[0];
check('con todo roto, avisa en vez de mandar vacio', () => assert.match(msgRoto.mensaje, /no salió nada con score 5\+/));
check('reporta fallidas', () => assert.equal(msgRoto.fallidas, roto.length));

console.log('\n' + (fallos ? `${fallos} FALLOS` : 'TODO OK'));
console.log('\n--- Muestra del WhatsApp ---\n' + msg.mensaje);
process.exit(fallos ? 1 : 0);
