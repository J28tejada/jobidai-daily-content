// ============================================================================
// Parsear respuesta IA
// Une la respuesta del modelo con los items originales y arma las filas que
// van a Supabase (columnas exactas de public.ideas_diarias).
//
// Nunca lanza: si el modelo no devuelve JSON válido, marca error='parse_error'
// para que la corrida quede registrada y sea diagnosticable.
// ============================================================================

const lote = $('Preparar lote para el modelo').first().json;
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

// --- Texto crudo de la respuesta (Gemini generateContent) -----------------
const respuesta = $input.first().json;
const candidato = respuesta?.candidates?.[0];

const texto = (candidato?.content?.parts || [])
  .map(p => p.text)
  .filter(t => typeof t === 'string')
  .join('')
  .trim();

// Gemini puede devolver 200 sin texto: filtro de seguridad, o corte por
// MAX_TOKENS. Se distingue de "devolvió texto pero no es JSON" para poder
// diagnosticar sin adivinar.
if (!texto) {
  const motivo = candidato?.finishReason
    || respuesta?.promptFeedback?.blockReason
    || 'desconocido';
  return items.map(it => fila(it, {
    descartable: true,
    error: `sin_respuesta:${motivo}`,
  }));
}

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
