import type { CommonSettingsStore } from "./common-settings-store.js";

export type CommonSettingsActionType =
	| "wechat-bind"
	| "wechat-rebind"
	| "wechat-unbind"
	| "toggle-wechat-notifications"
	| "toggle-wechat-question-notifications"
	| "toggle-wechat-permission-notifications"
	| "toggle-wechat-session-error-notifications"
	| "toggle-wechat-retry-error-notifications";

type WriteMeta = {
	reason?: string;
	source?: string;
	actionType?: string;
};

function ensureNotifications(settings: CommonSettingsStore) {
	settings.wechat.notifications = {
		enabled: settings.wechat.notifications.enabled !== false,
		question: settings.wechat.notifications.question !== false,
		permission: settings.wechat.notifications.permission !== false,
		sessionError: settings.wechat.notifications.sessionError !== false,
		retryError: settings.wechat.notifications.retryError !== false,
	};
}

async function writeToggle(input: {
	action: { type: CommonSettingsActionType };
	settings: CommonSettingsStore;
	writeSettings: (settings: CommonSettingsStore, meta?: WriteMeta) => Promise<void>;
}) {
	await input.writeSettings(input.settings, {
		reason: input.action.type,
		source: "applyCommonSettingsAction",
		actionType: input.action.type,
	});
}

export async function applyCommonSettingsAction(input: {
	action: { type: CommonSettingsActionType };
	readSettings: () => Promise<CommonSettingsStore>;
	writeSettings: (settings: CommonSettingsStore, meta?: WriteMeta) => Promise<void>;
}): Promise<boolean> {
	const settings = await input.readSettings();
	ensureNotifications(settings);

	if (input.action.type === "toggle-wechat-notifications") {
		settings.wechat.notifications.enabled = settings.wechat.notifications.enabled !== true;
		await writeToggle({ ...input, settings });
		return true;
	}

	if (input.action.type === "toggle-wechat-question-notifications") {
		settings.wechat.notifications.question = settings.wechat.notifications.question !== true;
		await writeToggle({ ...input, settings });
		return true;
	}

	if (input.action.type === "toggle-wechat-permission-notifications") {
		settings.wechat.notifications.permission = settings.wechat.notifications.permission !== true;
		await writeToggle({ ...input, settings });
		return true;
	}

	if (input.action.type === "toggle-wechat-session-error-notifications") {
		settings.wechat.notifications.sessionError = settings.wechat.notifications.sessionError !== true;
		await writeToggle({ ...input, settings });
		return true;
	}

	if (input.action.type === "toggle-wechat-retry-error-notifications") {
		settings.wechat.notifications.retryError = settings.wechat.notifications.retryError !== true;
		await writeToggle({ ...input, settings });
		return true;
	}

	return input.action.type === "wechat-bind"
		|| input.action.type === "wechat-rebind"
		|| input.action.type === "wechat-unbind";
}
