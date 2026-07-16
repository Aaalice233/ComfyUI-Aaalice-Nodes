import assert from "node:assert/strict";
import test from "node:test";

import {
	clampVolume,
	dispatchSimpleNotify,
	normalizeNotifyPayload,
} from "../js/lib/simple_notify_runtime.js";

function environment({ permission = "granted", soundFails = false } = {}) {
	const notifications = [];
	const sounds = [];
	const errors = [];
	function NotificationApi(title, options) {
		notifications.push({ title, options });
	}
	NotificationApi.permission = permission;
	NotificationApi.requestPermission = async () => {
		NotificationApi.permission = "granted";
		return "granted";
	};
	class AudioApi {
		constructor(url) {
			this.url = url;
			sounds.push(this);
		}
		async play() {
			if (soundFails) throw new Error("autoplay blocked");
		}
	}
	return {
		notifications,
		sounds,
		errors,
		options: {
			NotificationApi,
			AudioApi,
			audioUrl: "notify.mp3",
			onError: (code, error) => errors.push({ code, error }),
		},
	};
}

test("payload normalization uses the localized fallback and clamps volume", () => {
	assert.deepEqual(normalizeNotifyPayload({ message: "", volume: 4 }, "Localized"), {
		message: "Localized",
		desktop_notification: true,
		sound: true,
		volume: 1,
	});
	assert.equal(clampVolume("bad"), 0.5);
});

test("desktop notification and sound can both run", async () => {
	const env = environment();
	const result = await dispatchSimpleNotify({
		message: "Done", desktop_notification: true, sound: true, volume: 0.7,
	}, env.options);
	assert.deepEqual(result, { notification: "sent", sound: "played" });
	assert.deepEqual(env.notifications, [{ title: "ComfyUI", options: { body: "Done" } }]);
	assert.equal(env.sounds[0].url, "notify.mp3");
	assert.equal(env.sounds[0].volume, 0.7);
});

test("both alert channels can be disabled independently", async () => {
	const desktopOnly = environment();
	await dispatchSimpleNotify({ message: "Done", desktop_notification: true, sound: false, volume: 0.5 }, desktopOnly.options);
	assert.equal(desktopOnly.notifications.length, 1);
	assert.equal(desktopOnly.sounds.length, 0);

	const soundOnly = environment();
	await dispatchSimpleNotify({ message: "Done", desktop_notification: false, sound: true, volume: 0.5 }, soundOnly.options);
	assert.equal(soundOnly.notifications.length, 0);
	assert.equal(soundOnly.sounds.length, 1);

	const silent = environment();
	assert.deepEqual(
		await dispatchSimpleNotify({ message: "Done", desktop_notification: false, sound: false, volume: 0.5 }, silent.options),
		{ notification: "disabled", sound: "disabled" },
	);
});

test("background execution reports default and denied permissions without requesting", async () => {
	for (const [permission, expected] of [["default", "permissionRequired"], ["denied", "permissionDenied"]]) {
		const env = environment({ permission });
		await dispatchSimpleNotify({ message: "Done", desktop_notification: true, sound: false, volume: 0.5 }, env.options);
		assert.equal(env.errors[0].code, expected);
		assert.equal(env.notifications.length, 0);
	}
});

test("explicit testing requests permission and then sends a notification", async () => {
	const env = environment({ permission: "default" });
	const result = await dispatchSimpleNotify(
		{ message: "Test", desktop_notification: true, sound: false, volume: 0.5 },
		{ ...env.options, requestPermission: true },
	);
	assert.equal(result.notification, "sent");
	assert.equal(env.notifications.length, 1);
});

test("sound starts while an explicit permission request is still pending", async () => {
	const events = [];
	let grantPermission;
	function NotificationApi() {
		events.push("notification");
	}
	NotificationApi.permission = "default";
	NotificationApi.requestPermission = () => new Promise((resolve) => {
		grantPermission = () => {
			NotificationApi.permission = "granted";
			resolve("granted");
		};
	});
	class AudioApi {
		async play() {
			events.push("sound");
		}
	}
	const pending = dispatchSimpleNotify(
		{ message: "Test", desktop_notification: true, sound: true, volume: 0.5 },
		{ NotificationApi, AudioApi, requestPermission: true },
	);
	await Promise.resolve();
	assert.deepEqual(events, ["sound"]);
	grantPermission();
	await pending;
	assert.deepEqual(events, ["sound", "notification"]);
});

test("sound failure does not prevent the desktop notification", async () => {
	const env = environment({ soundFails: true });
	const result = await dispatchSimpleNotify({
		message: "Done", desktop_notification: true, sound: true, volume: 0.5,
	}, env.options);
	assert.deepEqual(result, { notification: "sent", sound: "failed" });
	assert.equal(env.errors[0].code, "soundFailed");
	assert.equal(env.notifications.length, 1);
});

test("desktop notification failure does not prevent the sound", async () => {
	const errors = [];
	function NotificationApi() {
		throw new Error("notification blocked");
	}
	NotificationApi.permission = "granted";
	let played = false;
	class AudioApi {
		async play() {
			played = true;
		}
	}
	const result = await dispatchSimpleNotify(
		{ message: "Done", desktop_notification: true, sound: true, volume: 0.5 },
		{ NotificationApi, AudioApi, onError: (code) => errors.push(code) },
	);
	assert.deepEqual(result, { notification: "failed", sound: "played" });
	assert.deepEqual(errors, ["notificationFailed"]);
	assert.equal(played, true);
});

test("missing browser APIs are reported without throwing", async () => {
	const errors = [];
	const result = await dispatchSimpleNotify(
		{ message: "Done", desktop_notification: true, sound: true, volume: 0.5 },
		{ NotificationApi: null, AudioApi: null, onError: (code) => errors.push(code) },
	);
	assert.deepEqual(result, { notification: "unsupported", sound: "failed" });
	assert.deepEqual(errors, ["notificationUnsupported", "soundFailed"]);
});
