/** The trending page has no API, so parse the markup we are given. */
export function parseTrending(html) {
  const rows = [];
  for (const block of html.split(/<article\b[^>]*class=["'][^"']*\bBox-row\b[^"']*["'][^>]*>/i).slice(1)) {
    const href = /<h2\b[^>]*>[\s\S]*?<a\b[^>]*href=["']\/([^"']+)["']/i.exec(block)?.[1];
    if (!href) continue;
    const [owner, repo] = href.split('/');
    const description = /<p class="col-9[^"]*">([\s\S]*?)<\/p>/.exec(block)?.[1]?.replace(/<[^>]+>/g, '').trim();
    const stars = Number(/stargazers[^>]*>\s*(?:<svg[\s\S]*?<\/svg>)?\s*([\d,]+)/.exec(block)?.[1]?.replace(/,/g, '') ?? 0);
    const language = /itemprop="programmingLanguage">([^<]+)</.exec(block)?.[1]?.trim();
    rows.push({ owner, repo: `${owner}/${repo}`, href, url: `https://github.com/${owner}/${repo}`, description, stars, language });
  }
  return rows;
}

