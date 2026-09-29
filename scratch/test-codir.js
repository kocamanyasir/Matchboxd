async function check(filmSlug) {
  console.log('=== Checking:', filmSlug);
  const res = await fetch(`https://letterboxd.com/film/${filmSlug}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.text();
  const ld = html.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
  if (ld) {
    const data = JSON.parse(ld[1].replace(/\/\* <\!\[CDATA\[ \*\/|\/\* \]\]> \*\//g, '').trim());
    console.log('JSON-LD director:', JSON.stringify(data.director, null, 2));
  }

  // Check HTML for "Co-director" or "Co-Director"
  const coDirRegex = /<h3[^>]*>[\s\S]*?Co-director[\s\S]*?<\/h3>[\s\S]*?<div class=["']text-sluglist["']>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = coDirRegex.exec(html)) !== null) {
    const names = [...match[1].matchAll(/<a[^>]*class=["']text-slug["'][^>]*>([^<]+)<\/a>/g)].map(m => m[1].trim());
    console.log('HTML Co-directors found:', names);
  }

  // Also check if Co-Director is in any other pattern
  const anyCoDir = [...html.matchAll(/Co-director[\s\S]{0,200}/gi)];
  for (const m of anyCoDir.slice(0, 3)) {
    console.log('Co-dir snippet:', m[0].replace(/\s+/g, ' '));
  }
}

async function main() {
  await check('coco-2017');
  await check('up-2009');
}
main();
