import { handleOAuthCallback, handleOAuthResult, handleOAuthStart, handleSession } from "./auth.js";
import { corsHeaders, errorResponse, json, relayConfigurationError } from "./http.js";
import { configuredWebhookTargets, handleShare, handleTargets } from "./share.js";

export { callbackResponse } from "./auth.js";
export { isAllowedOrigin } from "./http.js";
export { buildDiscordWebhookPayloads, configuredWebhookTargets, discordFence, enforceRateLimit } from "./share.js";

function validateEnvironment(env) {
	const required = [
		"DISCORD_CLIENT_ID",
		"DISCORD_CLIENT_SECRET",
		"DISCORD_GUILD_ID",
		"DISCORD_WEBHOOK_TARGETS",
		"STATE_SECRET",
		"SESSIONS",
		"SHARE_RATE_LIMITER",
	];
	const missing = required.filter((key) => !env[key]);
	if (missing.length) {
		throw relayConfigurationError(`Missing Worker configuration: ${missing.join(", ")}`);
	}
	configuredWebhookTargets(env);
}

export default {
	async fetch(request, env) {
		try {
			validateEnvironment(env);
			const url = new URL(request.url);
			if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
			if (request.method === "GET" && url.pathname === "/v1/oauth/start") return handleOAuthStart(request, env);
			if (request.method === "GET" && url.pathname === "/v1/oauth/callback") return handleOAuthCallback(request, env);
			if (request.method === "POST" && url.pathname === "/v1/oauth/result") return await handleOAuthResult(request, env);
			if (["GET", "DELETE"].includes(request.method) && url.pathname === "/v1/session") return await handleSession(request, env);
			if (request.method === "GET" && url.pathname === "/v1/targets") return await handleTargets(request, env);
			if (request.method === "POST" && url.pathname === "/v1/share") return await handleShare(request, env);
			return errorResponse("not_found", "Not found.", 404, corsHeaders(request, env));
		} catch (error) {
			console.error("Discord share relay error", error, error.internalDetail || "");
			const status = Number(error.status) || 500;
			const code = error.code || (status === 500 ? "internal_error" : "request_failed");
			const message = status === 500 ? "Discord share service failed." : error.message;
			return json(
				{ code, message, ...(error.details || {}) },
				status,
				{ ...corsHeaders(request, env), ...(error.headers || {}) },
			);
		}
	},
};
