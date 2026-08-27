// ============================================================================
// Parsear respuesta IA
// Une la respuesta de Claude con los items originales y arma las filas que
// van a Supabase (columnas exactas de public.ideas_diarias).
//
// Nunca lanza: si la IA no devuelve JSON válido, marca error='parse_error'
// para que la corrida quede registrada y sea diagnosticable.
// ============================================================================

const lote = $('Preparar lote para Claude').first().json;
const { fecha, items } = lote;

const fila = (it, extra) => ({
  json: {
    fecha,
    fuente: it.fuente,
    titulo: it.titulo,
    url: it.url,
    puntaje: it.puntaje,
    publicado_en: it.publicado_en,
    resumen: null,
    angulos: [],
    formato_sugerido: null,
    score_relevancia: null,
    descartable: false,
    error: null,
    raw: it.raw,
    ...extra,
  },
});

// --- Texto crudo de la respuesta ------------------------------------------
const respuesta = $input.first().json;
const texto = (respuesta?.content || [])
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('')
  .trim();

// --- Parseo tolerante: la IA a veces envuelve en ```json a pesar del prompt --
function parsear(txt) {
  if (!txt) return null;
  const limpio = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(limpio);
  } catch (e) {
    const desde = limpio.indexOf('[');
    const hasta = limpio.lastIndexOf(']');
    if (desde === -1 || hasta <= desde) return null;
    try {
      return JSON.parse(limpio.slice(desde, hasta + 1));
    } catch (e2) {
      return null;
    }
  }
}

const parseado = parsear(texto);

// --- Fallo total: se guarda todo el lote marcado, no se pierde la corrida ---
if (!Array.isArray(parseado)) {
  return items.map(it => fila(it, {
    descartable: true,
    error: 'parse_error',
    resumen: null,
  }));
}

// --- Unión por id, con fallback a posición ---------------------------------
const porId = new Map();
for (const r of parseado) {
  if (r && typeof r === 'object' && r.id != null) porId.set(String(r.id), r);
}

const normalizarAngulos = a => {
  if (!Array.isArray(a)) return [];
  return a
    .filter(x => x && typeof x === 'object')
    .map(x => ({ angulo: String(x.angulo ?? ''), gancho: String(x.gancho ?? '') }))
    .filter(x => x.angulo || x.gancho);
};

const score = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n)));
};

return items.map((it, i) => {
  const r = porId.get(String(it.id)) ?? parseado[i];

  if (!r || typeof r !== 'object') {
    return fila(it, { descartable: true, error: 'parse_error' });
  }

  return fila(it, {
    resumen: r.resumen ? String(r.resumen) : null,
    angulos: normalizarAngulos(r.angulos),
    formato_sugerido: r.formato_sugerido ? String(r.formato_sugerido) : null,
    score_relevancia: score(r.score_relevancia),
    descartable: r.descartable === true,
  });
});
