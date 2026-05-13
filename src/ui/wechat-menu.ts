import type { WechatSettingsStore } from "../settings-store.js";
import { readWechatSettingsStore } from "../settings-store.js";
import type { OperatorBinding } from "../wechat/operator-store.js";
import { readOperatorBinding } from "../wechat/operator-store.js";

export type WechatSettingsMenuEntry = {
	title: "OpenCode WeChat";
	value: "opencode-wechat.settings";
	category: "OpenCode";
};

export type WechatMenuActionType =
	| "wechat-bind"
	| "wechat-rebind"
	| "toggle-wechat-notifications"
	| "toggle-wechat-question-notifications"
	| "toggle-wechat-permission-notifications"
	| "toggle-wechat-session-error-notifications"
	| "toggle-wechat-retry-error-notifications"
	| "wechat-export-debug-bundle-sanitized"
	| "wechat-export-debug-bundle-full"
	| "wechat-openclaw-dry-run-command";

export type WechatMenuItem = {
	label: string;
	value: WechatMenuActionType | "noop";
	hint?: string;
	disabled?: boolean;
};

export type BuildWechatMenuInput = {
	settings?: WechatSettingsStore;
	operatorBinding?: OperatorBinding;
	readSettings?: () => Promise<WechatSettingsStore>;
	readOperatorBinding?: () => Promise<OperatorBinding | undefined>;
};

function enabledLabel(value: boolean): string {
	return value ? "已开启" : "已关闭";
}

function bindingRows(
	binding:
		| WechatSettingsStore["wechat"]["primaryBinding"]
		| OperatorBinding
		| undefined,
): WechatMenuItem[] {
	if (!binding) {
		return [{ label: "当前绑定状态：未绑定", value: "noop", disabled: true }];
	}

	const accountId =
		"accountId" in binding ? binding.accountId : binding.wechatAccountId;
	return [
		{ label: "当前绑定状态：已绑定", value: "noop", disabled: true },
		{ label: `accountId: ${accountId}`, value: "noop", disabled: true },
		...("name" in binding && binding.name
			? [
					{
						label: `name: ${binding.name}`,
						value: "noop" as const,
						disabled: true,
					},
				]
			: []),
		...(binding.userId
			? [
					{
						label: `userId: ${binding.userId}`,
						value: "noop" as const,
						disabled: true,
					},
				]
			: []),
	];
}

export function buildWechatSettingsMenuEntry(): WechatSettingsMenuEntry {
	return {
		title: "OpenCode WeChat",
		value: "opencode-wechat.settings",
		category: "OpenCode",
	};
}

export function buildWechatMenuItems(input: {
	settings: WechatSettingsStore;
	operatorBinding?: OperatorBinding;
}): WechatMenuItem[] {
	const notifications = input.settings.wechat.notifications;
	const binding = input.settings.wechat.primaryBinding ?? input.operatorBinding;
	const bindAction: WechatMenuActionType = binding
		? "wechat-rebind"
		: "wechat-bind";

	return [
		...bindingRows(binding),
		{ label: binding ? "重绑微信" : "绑定微信", value: bindAction },
		{
			label: `微信通知总开关：${enabledLabel(notifications.enabled)}`,
			value: "toggle-wechat-notifications",
		},
		{
			label: `question 通知：${enabledLabel(notifications.question)}`,
			value: "toggle-wechat-question-notifications",
		},
		{
			label: `permission 通知：${enabledLabel(notifications.permission)}`,
			value: "toggle-wechat-permission-notifications",
		},
		{
			label: `session error 通知：${enabledLabel(notifications.sessionError)}`,
			value: "toggle-wechat-session-error-notifications",
		},
		{
			label: `retry-error 通知：${enabledLabel(notifications.retryError)}`,
			value: "toggle-wechat-retry-error-notifications",
		},
		{
			label: "导出脱敏 debug bundle",
			value: "wechat-export-debug-bundle-sanitized",
		},
		{
			label: "导出完整 debug bundle",
			value: "wechat-export-debug-bundle-full",
		},
		{
			label: "显示 OpenClaw dry-run 命令",
			value: "wechat-openclaw-dry-run-command",
			hint: "npm run wechat:smoke:real-account -- --dry-run",
		},
	];
}

export async function loadWechatMenuItems(
	input: BuildWechatMenuInput = {},
): Promise<WechatMenuItem[]> {
	const settings =
		input.settings ?? (await (input.readSettings ?? readWechatSettingsStore)());
	const operatorBinding =
		input.operatorBinding ??
		(await (input.readOperatorBinding ?? readOperatorBinding)());
	return buildWechatMenuItems({ settings, operatorBinding });
}
