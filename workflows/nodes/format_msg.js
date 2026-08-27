// ============================================================================
// Formatear mensaje
// Arma el texto de WhatsApp. Lee de "Parsear respuesta IA" (no de Supabase)
// para no depender del shape que devuelve el insert.
// ============================================================================

const TOP_N = 5;   // ideas que se mandan por WhatsApp

const todas = $('Parsear respuesta IA').all().map(i => i.json);
const fecha = todas[0]?.fecha ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

const fallidas = todas.filter(i => i.error).length;

const utiles = todas
  .filter(i => !i.descartable && !i.error && (i.score_relevancia ?? 0) >= 5)
  .sort((a, b) => (b.score_relevancia ?? 0) - (a.score_relevancia ?? 0))
  .slice(0, TOP_N);

const lineas = [`*Ideas del día — ${fecha}*`, ''];

if (utiles.length === 0) {
  lineas.push('Hoy no salió nada con score 5+. Revisa la tabla `ideas_diarias` si quieres ver el resto.');
} else {
  utiles.forEach((it, n) => {
    lineas.push(`*${n + 1}. ${it.titulo}*`);
    lineas.push(`_${it.fuente} · relevancia ${it.score_relevancia}/10 · ${it.formato_sugerido ?? 'formato libre'}_`);
    if (it.resumen) lineas.push(it.resumen);

    (it.angulos || []).slice(0, 2).forEach(a => {
      lineas.push(`  • ${a.angulo}`);
      if (a.gancho) lineas.push(`    _"${a.gancho}"_`);
    });

    if (it.url) lineas.push(it.url);
    lineas.push('');
  });
}

lineas.push('---');
lineas.push(`${todas.length} items procesados · ${utiles.length} con score 5+${fallidas ? ` · ${fallidas} con error de parseo` : ''}`);

return [{
  json: {
    mensaje: lineas.join('\n'),
    fecha,
    total: todas.length,
    destacadas: utiles.length,
    fallidas,
  },
}];
