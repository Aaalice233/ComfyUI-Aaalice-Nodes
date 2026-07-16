/** Browser-side alert behavior for SimpleNotify, kept independent from ComfyUI UI state. */

export function clampVolume(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return 0.5;
	return Math.max(0, Math.min(1, numeric));
}

export function normalizeNotifyPayload(payload, fallbackMessage) {
	const source = payload && typeof payload === "object" ? payload : {};
	const rawMessage = typeof source.message === "string" ? source.message : String(source.message ?? "");
	return {
		message: rawMessage.trim() ? rawMessage : fallbackMessage,
		desktop_notification: source.desktop_notification !== false,
		sound: source.sound !== false,
		volume: clampVolume(source.volume),
	};
}

async function sendDesktopNotification(config, environment, requestPermission) {
	if (!config.desktop_notification) return "disabled";
	const NotificationApi = environment.NotificationApi;
	if (typeof NotificationApi !== "function") {
		environment.onError("notificationUnsupported", new Error("Notification API is unavailable"));
		return "unsupported";
	}

	let permission = NotificationApi.permission;
	if (permission === "default" && requestPermission) {
		try {
			permission = await NotificationApi.requestPermission();
		} catch (error) {
			environment.onError("permissionRequestFailed", error);
			return "failed";
		}
	}
	if (permission === "default") {
		environment.onError("permissionRequired", new Error("Notification permission has not been requested"));
		return "permission-required";
	}
	if (permission === "denied") {
		environment.onError("permissionDenied", new Error("Notification permission is denied"));
		return "denied";
	}
	if (permission !== "granted") {
		environment.onError("notificationFailed", new Error(`Unexpected notification permission: ${permission}`));
		return "failed";
	}

	try {
		new NotificationApi("ComfyUI", { body: config.message });
		return "sent";
	} catch (error) {
		environment.onError("notificationFailed", error);
		return "failed";
	}
}

async function playAlertSound(config, environment) {
	if (!config.sound) return "disabled";
	const AudioApi = environment.AudioApi;
	if (typeof AudioApi !== "function") {
		environment.onError("soundFailed", new Error("Audio API is unavailable"));
		return "failed";
	}
	try {
		const audio = new AudioApi(environment.audioUrl);
		audio.volume = clampVolume(config.volume);
		await audio.play();
		return "played";
	} catch (error) {
		environment.onError("soundFailed", error);
		return "failed";
	}
}

export async function dispatchSimpleNotify(config, {
	NotificationApi = globalThis.Notification,
	AudioApi = globalThis.Audio,
	audioUrl = "",
	requestPermission = false,
	onError = () => {},
} = {}) {
	const environment = { NotificationApi, AudioApi, audioUrl, onError };
	const [notification, sound] = await Promise.all([
		sendDesktopNotification(config, environment, requestPermission),
		playAlertSound(config, environment),
	]);
	return { notification, sound };
}
