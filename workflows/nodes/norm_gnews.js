// Google News RSS -> formato común
// El nodo RSS Feed Read emite un item por entrada del feed.
return $input.all()
  .filter(i => i.json.title)
  .slice(0, 15)
  .map(i => {
    const it = i.json;
    return {
      json: {
        fuente: 'google_news',
        titulo: String(it.title).replace(/\s+-\s+[^-]+$/, '').trim(), // quita " - Medio" del final
        url: it.link || null,
        puntaje: null,
        publicado_en: it.isoDate || it.pubDate || null,
        extracto: (it.contentSnippet || it.content || '').replace(/<[^>]+>/g, '').slice(0, 500) || null,
        raw: { titulo_original: it.title, creator: it.creator || null },
      },
    };
  });
