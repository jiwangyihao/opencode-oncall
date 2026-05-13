import { appendFile } from "node:fs/promises";
import type { Plugin } from "@opencode-ai/plugin";
import type {
	BuildPluginHooksInput,
	WechatPluginHooks,
} from "./plugin-hooks.js";
import {
	buildPluginHooks,
	isBridgeCapableBrokerOwnerInput,
} from "./plugin-hooks.js";
import { readWechatSettingsStore } from "./settings-store.js";
import type { WechatSettingsMenuEntry } from "./ui/wechat-menu.js";
import {
	buildWechatSettingsMenuEntry,
	loadWechatMenuItems,
} from "./ui/wechat-menu.js";
import { connectOrSpawnBroker } from "./wechat/broker-launcher.js";
import {
	brokerStartupDiagnosticsPath,
	ensureWechatStateLayout,
} from "./wechat/state-paths.js";

export type WechatBrokerConnection = {
	endpoint: string;
};

export type WechatPluginMetadata = {
	settingsEntry: WechatSettingsMenuEntry;
};

type ToastFn = (options: {
	body: { message: string; variant: "warning" };
}) => Promise<unknown>;

type PluginTestSeams = {
	ensureWechatBrokerStarted?: () => Promise<unknown>;
	createWechatBridgeLifecycleImpl?: BuildPluginHooksInput["createWechatBridgeLifecycleImpl"];
	client?: { tui?: { showToast?: ToastFn } };
};

let brokerEnsurePromiseInProcess: Promise<WechatBrokerConnection> | undefined;
let brokerEnsureSucceededInProcess = false;

function toWechatBrokerConnection(value: unknown): WechatBrokerConnection {
	if (
		value &&
		typeof value === "object" &&
		typeof (value as { endpoint?: unknown }).endpoint === "string"
	) {
		return { endpoint: (value as { endpoint: string }).endpoint };
	}
	throw new Error("Wechat broker 启动结果缺少 endpoint");
}

function formatBrokerStartupError(error: unknown): string {
	if (error instanceof Error)
		return error.stack ?? `${error.name}: ${error.message}`;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

async function recordBrokerStartupFailure(input: {
	diagnosticsPath: string;
	error: unknown;
	showToast?: ToastFn;
}) {
	const line = JSON.stringify({
		at: new Date().toISOString(),
		provider: "opencode-wechat",
		reason: formatBrokerStartupError(input.error),
	});

	try {
		await ensureWechatStateLayout();
		await appendFile(input.diagnosticsPath, `${line}\n`, "utf8");
	} catch {}

	try {
		await input.showToast?.({
			body: {
				message: `Wechat broker 启动失败，已写入诊断文件：${input.diagnosticsPath}`,
				variant: "warning",
			},
		});
	} catch {}
}

export function buildWechatPluginMetadata(): WechatPluginMetadata {
	return {
		settingsEntry: buildWechatSettingsMenuEntry(),
	};
}

async function ensureBrokerStarted(input: {
	ensureWechatBrokerStarted?: () => Promise<unknown>;
	diagnosticsPath: string;
	showToast?: ToastFn;
}): Promise<WechatBrokerConnection> {
	if (!brokerEnsurePromiseInProcess) {
		const starter = input.ensureWechatBrokerStarted ?? connectOrSpawnBroker;
		const promise = Promise.resolve()
			.then(() => starter())
			.then((result) => toWechatBrokerConnection(result))
			.then((connection) => {
				brokerEnsureSucceededInProcess = true;
				return connection;
			});

		brokerEnsurePromiseInProcess = promise;
		void promise
			.catch((error) =>
				recordBrokerStartupFailure({
					diagnosticsPath: input.diagnosticsPath,
					error,
					showToast: input.showToast,
				}),
			)
			.finally(() => {
				if (brokerEnsurePromiseInProcess === promise)
					brokerEnsurePromiseInProcess = undefined;
			});
	}

	return brokerEnsurePromiseInProcess;
}

export const OpenCodeWechat: Plugin = async (input) => {
	const diagnosticsPath = brokerStartupDiagnosticsPath();
	const testSeams = input as PluginTestSeams;
	const showToast = testSeams.client?.tui?.showToast;
	const injectedEnsureBroker = testSeams.ensureWechatBrokerStarted;
	const createWechatBridgeLifecycleImpl =
		testSeams.createWechatBridgeLifecycleImpl;

	await readWechatSettingsStore().catch(() => undefined);
	await loadWechatMenuItems().catch(() => []);

	let initialWechatBrokerPromise: Promise<WechatBrokerConnection> | undefined;
	if (
		isBridgeCapableBrokerOwnerInput({
			client: input.client,
			serverUrl: input.serverUrl,
		}) &&
		!brokerEnsureSucceededInProcess
	) {
		initialWechatBrokerPromise = ensureBrokerStarted({
			ensureWechatBrokerStarted: injectedEnsureBroker,
			diagnosticsPath,
			showToast,
		});
	}

	return buildPluginHooks({
		client: input.client,
		project: input.project,
		directory: input.directory,
		serverUrl: input.serverUrl,
		initialWechatBrokerPromise,
		createWechatBridgeLifecycleImpl,
		onFallbackToast: showToast
			? (payload) =>
					showToast({
						body: {
							message: payload.message,
							variant: "warning",
						},
					}).then(() => undefined)
			: undefined,
	}) as WechatPluginHooks;
};
