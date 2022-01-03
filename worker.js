// NanoId code (Source: https://github.com/ai/nanoid)
let nanoid=(t=21)=>{let e="",r=crypto.getRandomValues(new Uint8Array(t));for(;t--;){let n=63&r[t];e+=n<36?n.toString(36):n<62?(n-26).toString(36).toUpperCase():n<63?"_":"-"}return e};

addEventListener('fetch', event => {
	switch (event.request.method) {
		case 'POST':
			return event.respondWith(handlePOST(event.request));
		case 'DELETE':
			return event.respondWith(handleDELETE(event.request));
		default:
			return event.respondWith(handleRequest(event.request));
	}
});

const apiKeyHeader = 'X-Api-Key';
const domain = 'https://shorta.link';
const frontDomain = 'https://go.shorta.link';
const plaintextClients = ['curl', 'wget', 'fetch', 'httpie', 'lwp-request', 'python-requests'];
const frontPage = `
Send a POST request to https://shorta.link with form data params 'url' and (optional) 'slug' to generate a short link from the specified URL.

Example:
$ curl -F "url=https://www.google.com" https://shorta.link
> https://shorta.link/bH19WkWO

Example with slug:
$ curl -F "url=https://www.google.com" -F "slug=google" https://shorta.link
> https://shorta.link/google
`;

function setCustomHeaders(init) {
	const headers = new Headers(init);
	headers.append("Access-Control-Allow-Origin", "*");
	return headers;
}

/**
 * Respond to POST requests with shortened URL creation
 * @param {Request} request
 */
async function handlePOST(request) {
	const headers = setCustomHeaders(request.headers);
	const apiKey = request.headers.get(apiKeyHeader);
	if (apiKey && apiKey !== SECRET_API_KEY) {
		return new Response('Invalid X-Api-Key header', { status: 403, headers: headers });
	}

	const data = await request.formData();
	const redirectURL = data.get('url');
	const slug = data.get('slug');

	if (!redirectURL){
		return new Response('`url` need to be set.', { status: 400, headers: headers });
	}

	// validate redirectURL is a URL
	try {
		new URL(redirectURL);
	} catch (e) {
		if (e instanceof TypeError) 
			return new Response('`url` needs to be a valid http url.', { status: 400, headers: headers });
		else throw e;
	};

	// slug flow
	if (slug) {
		// No overwrite current slug if it exists
		const existing = await LINKS.get(slug);
		if (existing) {
			return new Response(`${slug} already exists.`, { status: 400, headers: headers });
		} else {
			await LINKS.put(slug, redirectURL);
			return new Response(`${domain}/${slug}\n`, {
				status: 201,
				headers: headers
			});
		}
	}

	const generatedHash = nanoid(8);
	while (await LINKS.get(generatedHash)) {
		generatedHash = nanoid(8);
	}
	await LINKS.put(generatedHash, redirectURL);
	return new Response(`${domain}/${generatedHash}\n`, {
		status: 201,
		headers: headers
	});
}

/**
 * Respond to DELETE requests by deleting the shortlink
 * @param {Request} request
 */
async function handleDELETE(request) {
	const headers = setCustomHeaders(request.headers);
	const apiKey = request.headers.get(apiKeyHeader);
	if (apiKey && apiKey !== SECRET_API_KEY) {
		return new Response('Invalid X-Api-Key header', { status: 403, headers: headers });
	}

	const url = new URL(request.url);
	const path = url.pathname.split('/')[1];
	if (!path) {
		return new Response('Not found', { status: 404, headers: headers });
	}
	await LINKS.delete(path);
	return new Response(`${request.url} deleted!`, { status: 200, headers: headers });
}

/**
 * Respond to GET requests with redirects.
 *
 * Authenticated GET requests without a path will return a list of all
 * shortlinks registered with the service.
 * @param {Request} request
 */
async function handleRequest(request) {
	const userAgent = request.headers.get('user-agent');
	const headers = setCustomHeaders(request.headers);
	const url = new URL(request.url);
	const path = url.pathname.split('/')[1];
	if (!path) {
		// Return list of available shortlinks if user supplies admin credentials.
		const apiKey = request.headers.get(apiKeyHeader);
		if (apiKey && apiKey === SECRET_API_KEY) {
			const { keys } = await LINKS.list();
			let paths = "";
			keys.forEach(element => paths += `${element.name}\n`);
			
			return new Response(paths, { status: 200, headers: headers });
		}

		if (userAgent && plaintextClients.some(ua => userAgent.includes(ua))) {
			return new Response(frontPage, { status: 200, headers: headers });
		}
		return Response.redirect(frontDomain, 301);
	}

	const redirectURL = await LINKS.get(path);
	if (redirectURL) {
		return Response.redirect(redirectURL, 302);
	}

	return new Response('URL not found. Ensure it is correct. Otherwise, it has been removed due to TOS, DMCA request or others', { status: 404, headers: headers });
}
