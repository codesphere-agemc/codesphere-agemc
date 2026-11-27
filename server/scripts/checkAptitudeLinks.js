// Checks every external Aptitude resource link still opens, and that every
// topic has at least one link.
// Usage (from server/): node scripts/checkAptitudeLinks.js
const { allUrls, TOPICS } = require('../data/aptitudeResources');
const { topicIndex } = require('../data/aptitudeTopics');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

async function status(url) {
  for (let i = 0; i < 2; i += 1) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      return { code: res.status, final: res.url };
    } catch (error) {
      if (i) return { code: 0, final: error.cause?.code || error.message };
    }
  }
  return { code: 0, final: '' };
}

(async () => {
  const problems = [];
  for (const slug of topicIndex.keys()) if (!TOPICS[slug]?.length) problems.push(`topic "${slug}" has no links`);
  for (const slug of Object.keys(TOPICS)) if (!topicIndex.has(slug)) problems.push(`links for unknown topic "${slug}"`);

  const urls = allUrls();
  const results = [];
  // A few at a time, to be polite to the sites.
  for (let i = 0; i < urls.length; i += 6) {
    results.push(...await Promise.all(urls.slice(i, i + 6).map(async (url) => ({ url, ...(await status(url)) }))));
  }
  results.forEach((r) => {
    const movedAway = r.code === 200 && new URL(r.final).pathname.replace(/\/$/, '') !== new URL(r.url).pathname.replace(/\/$/, '');
    if (r.code !== 200) problems.push(`${r.code || 'no answer'}  ${r.url}  ${r.code ? '' : r.final}`);
    else if (movedAway) problems.push(`redirects to ${r.final}  (from ${r.url})`);
  });
  console.log(`Checked ${urls.length} links across ${Object.keys(TOPICS).length} topics.`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exitCode = 1;
  } else console.log('All links work.');
})();
