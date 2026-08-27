// Reddit (listing .json) -> formato común
const res = $input.first().json;
const children = res?.data?.children || [];

return children
  .map(c => c.data)
  .filter(p => p && p.title && !p.stickied)
  .slice(0, 15)
  .map(p => ({
    json: {
      fuente: 'reddit',
      titulo: p.title,
      url: p.url_overridden_by_dest || `https://www.reddit.com${p.permalink}`,
      puntaje: p.score ?? null,
      publicado_en: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
      extracto: (p.selftext || '').slice(0, 500) || null,
      raw: { subreddit: p.subreddit, permalink: p.permalink, num_comments: p.num_comments },
    },
  }));
