const http = require("http");
const getPort = require("get-port");
const util = require("util");
const puppeteer = require("puppeteer");
const bluebird = require("bluebird");
const rxjs = require("rxjs");
const {mergeMap, toArray} = require("rxjs/operators");
const {orderedMergeMap} = require("./orderedmergemap.js");

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const withWebServer = async (fn) => {
	const port = await getPort();

	const app = http.createServer(async (req, res) => {
		await wait(Math.random() * 100);
		const url = req.url;
		if (url.endsWith("/403")) {
			res.writeHead(403);
			res.end();
		} else {
			const html = `<html><body><div id="result">Result for: ${url}</div></body></html>`;
			res.setHeader("Content-Type", "text/html");
			res.writeHead(200);
			res.end(html);
		}
	});

	try {
		await util.promisify(app.listen.bind(app))(port);

		return await fn(`http://localhost:${port}`);
	}finally {
		app.close();
	}
};

(async () => {
	// serialized
	console.log("Run scraping sequentially");
	await withWebServer(async (host) => {
		const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--no-zygote", "--disable-gpu", "--single-process", "--disable-dev-profile", "--disable-dev-shm-usage"]});

		const urls = ["a", "b", "c"];
		const results = [];
		for (const url of urls) {
			const page = await browser.newPage();
			console.log(`Scraping ${url}`);
			await page.goto(`${host}/${url}`);

			const result = await page.evaluate(e => e.textContent, await page.$("#result"));
			console.log(`Scraping ${url} finished`);
			results.push(result);

			await page.close();
		}

		await browser.close();

		console.log(results);
	});

	// error handling
	const withBrowser = async (fn) => {
		const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--no-zygote", "--disable-gpu", "--single-process", "--disable-dev-profile", "--disable-dev-shm-usage"]});
		try {
			return await fn(browser);
		} finally {
			await browser.close();
		}
	};

	const withPage = (browser) => async (fn) => {
		const page = await browser.newPage();
		try {
			return await fn(page);
		} finally {
			await page.close();
		}
	};

	console.log("\nRun scraping sequentially with async disposers");
	await withWebServer(async (host) => {
		const urls = ["a", "b", "c"];
		const results = [];

		await withBrowser(async (browser) => {
			for (const url of urls) {
				const result = await withPage(browser)(async (page) => {
					console.log(`Scraping ${url}`);
					await page.goto(`${host}/${url}`);

					const result = await page.evaluate(e => e.textContent, await page.$("#result"));
					console.log(`Scraping ${url} finished`);
					return result;
				});

				results.push(result);
			}
		});

		console.log(results);
	});

	// parallel
	console.log("\nRun scraping in parallel with Promise.all");
	await withWebServer(async (host) => {
		const urls = ["a", "b", "c"];
		const results = await withBrowser(async (browser) => {
			return Promise.all(urls.map(async (url) => {
				return withPage(browser)(async (page) => {
					console.log(`Scraping ${url}`);
					await page.goto(`${host}/${url}`);

					const result = await page.evaluate(e => e.textContent, await page.$("#result"));
					console.log(`Scraping ${url} finished`);
					return result;
				});
			}));
		});
		console.log(results);
	});

	// controlled concurrency
	console.log("\nRun scraping in parallel with Bluebird promise");
	await withWebServer(async (host) => {
		const urls = ["a", "b", "c", "d", "e", "f"];
		const results = await withBrowser(async (browser) => {
			return bluebird.map(urls, async (url) => {
				return withPage(browser)(async (page) => {
					console.log(`Scraping ${url}`);
					await page.goto(`${host}/${url}`);

					const result = await page.evaluate(e => e.textContent, await page.$("#result"));
					console.log(`Scraping ${url} finished`);
					return result;
				});
			}, {concurrency: 3});
		});
		console.log(results);
	});

	// error handling
	console.log("\nError handling");
	await withWebServer(async (host) => {
		const urls = ["a", "b/403", "c/403", "d", "e", "f"];
		const results = await withBrowser(async (browser) => {
			return bluebird.map(urls, async (url) => {
				return withPage(browser)(async (page) => {
					console.log(`Scraping ${url}`);
					await page.goto(`${host}/${url}`);

					const result = await page.evaluate(e => e.textContent, await page.$("#result"));
					console.log(`Scraping ${url} finished`);
					return result;
				}).then((r) => ({result: r}), (e) => ({error: e}));
			}, {concurrency: 3});
		});
		console.log(results);
	});

	// rxjs mergemap
	console.log("\nRxJS mergeMap");
	await withWebServer(async (host) => {
		const urls = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
		const results = await withBrowser(async (browser) => {
			return rxjs.from(urls).pipe(
				mergeMap(async (url) => {
					return withPage(browser)(async (page) => {
						console.log(`Scraping ${url}`);
						await page.goto(`${host}/${url}`);

						const result = await page.evaluate(e => e.textContent, await page.$("#result"));
						console.log(`Scraping ${url} finished`);
						return result;
					});
				}, 3),
				toArray(),
			).toPromise();
		});
		console.log(results);
	});

	// rxjs orderedMergeMap
	console.log("\nRxJS orderedMergeMap");
	await withWebServer(async (host) => {
		const urls = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
		const results = await withBrowser(async (browser) => {
			return rxjs.from(urls).pipe(
				orderedMergeMap(async (url) => {
					return withPage(browser)(async (page) => {
						console.log(`Scraping ${url}`);
						await page.goto(`${host}/${url}`);

						const result = await page.evaluate(e => e.textContent, await page.$("#result"));
						console.log(`Scraping ${url} finished`);
						return result;
					});
				}, 3),
				toArray(),
			).toPromise();
		});
		console.log(results);
	});
})();
