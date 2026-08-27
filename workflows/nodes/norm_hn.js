// Hacker News (Algolia) -> formato común
const res = $input.first().json;
const hits = res.hits || [];

return hits
  .filter(h => h.title && (h.url || h.objectID))
  .slice(0, 15)
  .map(h => ({
    json: {
      fuente: 'hackernews',
      titulo: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      puntaje: h.points ?? null,
      publicado_en: h.created_at || null,
      extracto: (h.story_text || h.comment_text || '').replace(/<[^>]+>/g, '').slice(0, 500) || null,
      raw: h,
    },
  }));
