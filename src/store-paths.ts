import os from "node:os";
import path from "node:path";
import { xdgConfig } from "xdg-basedir";

function configBaseDir() {
	const override = process.env.XDG_CONFIG_HOME;
	if (typeof override === "string" && override.trim().length > 0) {
		return override.trim();
	}
	return xdgConfig ?? path.join(os.homedir(), ".config");
}

function opencodeConfigDir() {
	return path.join(configBaseDir(), "opencode");
}

export function opencodeWechatConfigDir(): string {
	return path.join(opencodeConfigDir(), "opencode-wechat");
}

export function wechatSettingsPath(): string {
	return path.join(opencodeWechatConfigDir(), "settings.json");
}

export function wechatLegacySettingsPath(): string {
	return path.join(opencodeConfigDir(), "account-switcher", "settings.json");
}

export function wechatLegacyConfigDir(): string {
	return path.join(opencodeConfigDir(), "account-switcher", "wechat");
}

export function wechatOperatorPath(): string {
	return path.join(opencodeWechatConfigDir(), "operator.json");
}

export function wechatBrokerStateStorePath(): string {
	return path.join(opencodeWechatConfigDir(), "broker-state-store.json");
}

export function wechatLatestAccountPath(): string {
	return path.join(opencodeWechatConfigDir(), "latest-account.json");
}

export function wechatRequestsDir(): string {
	return path.join(opencodeWechatConfigDir(), "requests");
}

export function wechatNotificationsDir(): string {
	return path.join(opencodeWechatConfigDir(), "notifications");
}

export function wechatDeadLetterDir(): string {
	return path.join(opencodeWechatConfigDir(), "dead-letter");
}

export function wechatInstancesDir(): string {
	return path.join(opencodeWechatConfigDir(), "instances");
}

export function wechatTokensDir(): string {
	return path.join(opencodeWechatConfigDir(), "tokens");
}

export function wechatBridgeDiagnosticsPath(): string {
	return path.join(
		opencodeWechatConfigDir(),
		"wechat-bridge.diagnostics.jsonl",
	);
}

export function wechatStatusRuntimeDiagnosticsPath(): string {
	return path.join(
		opencodeWechatConfigDir(),
		"wechat-status-runtime.diagnostics.jsonl",
	);
}

export function commonSettingsPath(): string {
	return wechatSettingsPath();
}

export function wechatConfigDir(): string {
	return opencodeWechatConfigDir();
}
