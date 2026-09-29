async function testExtractDirectors(slug) {
  const res = await fetch(`https://letterboxd.com/film/${slug}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.text();

  // 1. JSON-LD directors
  const jsonLdMatch = html.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
  const jsonDirectors = [];
  if (jsonLdMatch) {
    try {
      const clean = jsonLdMatch[1].replace(/\/\* <\!\[CDATA\[ \*\/|\/\* \]\]> \*\//g, "").trim();
      const data = JSON.parse(clean);
      if (data && data.director) {
        const arr = Array.isArray(data.director) ? data.director : [data.director];
        for (const d of arr) {
          const name = typeof d === "string" ? d : d?.name;
          if (name) jsonDirectors.push(name.trim());
        }
      }
    } catch (e) {}
  }

  // 2. HTML regex for /director/.../ and /co-director/.../
  const htmlDirectors = new Set();
  const htmlCoDirectors = new Set();

  // Find all links to /director/.../
  const dirRegex = /href=["']\/director\/[^"']+\/["'][^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = dirRegex.exec(html)) !== null) {
    const name = m[1].trim();
    if (name && name !== "…" && !name.includes("more")) {
      htmlDirectors.add(name);
    }
  }

  // Find all links to /co-director/.../
  const coDirRegex = /href=["']\/co-director\/[^"']+\/["'][^>]*>([^<]+)<\/a>/gi;
  while ((m = coDirRegex.exec(html)) !== null) {
    const name = m[1].trim();
    if (name && name !== "…" && !name.includes("more")) {
      htmlCoDirectors.add(name);
    }
  }

  const allDirs = Array.from(new Set([...jsonDirectors, ...htmlDirectors, ...htmlCoDirectors]));

  console.log(`=== Film: ${slug} ===`);
  console.log('JSON Directors:', jsonDirectors);
  console.log('HTML Directors:', Array.from(htmlDirectors));
  console.log('HTML Co-Directors:', Array.from(htmlCoDirectors));
  console.log('Final Combined Directors & Co-Directors:', allDirs);
  console.log();
}

async function run() {
  await testExtractDirectors('up-2009');
  await testExtractDirectors('coco-2017');
  await testExtractDirectors('spider-man-into-the-spider-verse');
  await testExtractDirectors('oppenheimer-2023');
  await testExtractDirectors('ratatouille');
}
run();
