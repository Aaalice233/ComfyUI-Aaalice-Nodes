export function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
	});
}

export function errorResponse(code, message, status, headers = {}) {
	return json({ code, message }, status, headers);
}

function configuredOrigins(env) {
	return new Set(String(env.ALLOWED_ORIGINS || "")
		.split(",")
		.map((value) => value.trim().replace(/\/$/, ""))
		.filter(Boolean));
}

export function isAllowedOrigin(value, env) {
	try {
		const origin = new URL(value).origin;
		const url = new URL(origin);
		const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
		return loopback || configuredOrigins(env).has(origin);
	} catch {
		return false;
	}
}

export function corsHeaders(request, env) {
	const origin = request.headers.get("origin") || "";
	if (!isAllowedOrigin(origin, env)) return { vary: "Origin" };
	return {
		"access-control-allow-origin": new URL(origin).origin,
		"access-control-allow-headers": "authorization, content-type",
		"access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
		vary: "Origin",
	};
}

export function relayConfigurationError(internalDetail) {
	const error = new Error("Discord sharing is temporarily unavailable because the relay service is not fully configured. Please contact the server administrator.");
	error.code = "relay_misconfigured";
	error.status = 503;
	error.internalDetail = internalDetail;
	return error;
}
