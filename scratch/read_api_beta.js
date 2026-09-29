const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(StealthPlugin());

async function main() {
  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto("https://letterboxd.com/api-beta/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await new Promise((r) => setTimeout(r, 4000));

    const text = await page.evaluate(() => document.body.innerText);
    console.log("=== PAGE TEXT START ===");
    console.log(text);
    console.log("=== PAGE TEXT END ===");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
}

main();
