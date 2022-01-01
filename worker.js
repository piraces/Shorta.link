// NanoId code (Source: https://github.com/ai/nanoid)
let nanoid=(t=21)=>{let e="",r=crypto.getRandomValues(new Uint8Array(t));for(;t--;){let n=63&r[t];e+=n<36?n.toString(36):n<62?(n-26).toString(36).toUpperCase():n<63?"_":"-"}return e};

addEventListener('fetch', event => {
	const { request } = event;

	switch (request.method) {
		case 'POST':
			return event.respondWith(handlePOST(request));
		case 'DELETE':
			return event.respondWith(handleDELETE(request));
		default:
			return event.respondWith(handleRequest(request));
	}
});

const apiKeyHeader = 'X-Api-Key';
const domain = 'https://shorta.link';
const frontDomain = 'https://go.shorta.link';

/**
 * Respond to POST requests with shortened URL creation
 * @param {Request} request
 */
async function handlePOST(request) {
	const apiKey = request.headers.get(apiKeyHeader);
	if (apiKey && apiKey !== SECRET_API_KEY) {
		return new Response('Invalid X-Api-Key header', { status: 403 });
	}

	const data = await request.formData();
	const redirectURL = data.get('url');
	const slug = data.get('slug');

	if (!redirectURL){
		return new Response('`url` need to be set.', { status: 400 });
	}

	// validate redirectURL is a URL
	try {
		new URL(redirectURL);
	} catch (e) {
		if (e instanceof TypeError) 
			return new Response('`url` needs to be a valid http url.', { status: 400 });
		else throw e;
	};

	// slug flow
	if (slug) {
		// No overwrite current slug if it exists
		const existing = await LINKS.get(slug);
		if (existing) {
			return new Response(`${slug} already exists.`, { status: 400 });
		} else {
			await LINKS.put(slug, redirectURL);
			return new Response(`${redirectURL} in now shortened with ${domain}/${slug}`, {
				status: 201,
			});
		}
	}

	const generatedHash = nanoid(8);
	while (await LINKS.get(generatedHash)) {
		generatedHash = nanoid(8);
	}
	await LINKS.put(generatedHash, redirectURL);
	return new Response(`${redirectURL} in now shortened with ${domain}/${generatedHash}`, {
		status: 201,
	});
}

/**
 * Respond to DELETE requests by deleting the shortlink
 * @param {Request} request
 */
async function handleDELETE(request) {
	const apiKey = request.headers.get(apiKeyHeader);
	if (apiKey && apiKey !== SECRET_API_KEY) {
		return new Response('Invalid X-Api-Key header', { status: 403 });
	}

	const url = new URL(request.url);
	const path = url.pathname.split('/')[1];
	if (!path) {
		return new Response('Not found', { status: 404 });
	}
	await LINKS.delete(path);
	return new Response(`${request.url} deleted!`, { status: 200 });
}

/**
 * Respond to GET requests with redirects.
 *
 * Authenticated GET requests without a path will return a list of all
 * shortlinks registered with the service.
 * @param {Request} request
 */
async function handleRequest(request) {
	const url = new URL(request.url);
	const path = url.pathname.split('/')[1];
	if (!path) {
		// Return list of available shortlinks if user supplies admin credentials.
		const apiKey = request.headers.get(apiKeyHeader);
		if (apiKey && apiKey === SECRET_API_KEY) {
			const { keys } = await LINKS.list();
			let paths = "";
			keys.forEach(element => paths += `${element.name}\n`);
			
			return new Response(paths, { status: 200 });
		}

		return Response.redirect(frontDomain, 301);
	}

	const redirectURL = await LINKS.get(path);
	if (redirectURL) {
		return Response.redirect(redirectURL, 302);
	}

	return new Response('URL not found. Ensure it is correct. Otherwise, it has been removed due to TOS, DMCA request or others', { status: 404 });
}
