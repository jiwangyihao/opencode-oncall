import { constants as fsConstants } from "node:fs";
import {
	access,
	copyFile,
	mkdir,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
	opencodeWechatConfigDir,
	wechatBridgeDiagnosticsPath,
	wechatBrokerStateStorePath,
	wechatDeadLetterDir,
	wechatInstancesDir,
	wechatLatestAccountPath,
	wechatLegacyConfigDir,
	wechatLegacySettingsPath,
	wechatNotificationsDir,
	wechatOperatorPath,
	wechatRequestsDir,
	wechatSettingsPath,
	wechatStatusRuntimeDiagnosticsPath,
	wechatTokensDir,
} from "./store-paths.js";

export type WechatBinding = {
	accountId: string;
	userId?: string;
	name?: string;
	enabled?: boolean;
	configured?: boolean;
	boundAt?: number;
};

export type WechatSettings = {
	primaryBinding?: WechatBinding;
	notifications: {
		enabled: boolean;
		question: boolean;
		permission: boolean;
		sessionError: boolean;
		retryError: boolean;
	};
	future?: {
		accounts?: WechatBinding[];
	};
};

export type WechatSettingsStore = {
	wechat: WechatSettings;
};

export type WechatNotificationDispatchSettings = {
	targetUserId?: string;
	targetAccountId?: string;
	notifications: WechatSettings["notifications"];
};

type UnknownRecord = Record<string, unknown>;

const STATE_COPY_TARGETS = [
	["operator.json", wechatOperatorPath],
	["broker-state-store.json", wechatBrokerStateStorePath],
	["latest-account.json", wechatLatestAccountPath],
	["tokens", wechatTokensDir],
	["requests", wechatRequestsDir],
	["notifications", wechatNotificationsDir],
	["dead-letter", wechatDeadLetterDir],
	["instances", wechatInstancesDir],
	["wechat-bridge.diagnostics.jsonl", wechatBridgeDiagnosticsPath],
	[
		"wechat-status-runtime.diagnostics.jsonl",
		wechatStatusRuntimeDiagnosticsPath,
	],
] as const;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function normalizeWechatBinding(input: unknown): WechatBinding | undefined {
	if (
		!isRecord(input) ||
		typeof input.accountId !== "string" ||
		input.accountId.length === 0
	) {
		return undefined;
	}

	return {
		accountId: input.accountId,
		...(typeof input.userId === "string" ? { userId: input.userId } : {}),
		...(typeof input.name === "string" ? { name: input.name } : {}),
		...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
		...(typeof input.configured === "boolean"
			? { configured: input.configured }
			: {}),
		...(typeof input.boundAt === "number" && Number.isFinite(input.boundAt)
			? { boundAt: input.boundAt }
			: {}),
	};
}

function normalizeFutureAccounts(
	input: unknown,
): WechatSettings["future"] | undefined {
	if (!isRecord(input) || !Array.isArray(input.accounts)) return undefined;
	const accounts = input.accounts
		.map((account) => normalizeWechatBinding(account))
		.filter((account): account is WechatBinding => Boolean(account));
	return accounts.length > 0 ? { accounts } : undefined;
}

function normalizeWechatSettings(input: unknown): WechatSettings {
	const source = isRecord(input) ? input : {};
	const notificationsSource = isRecord(source.notifications)
		? source.notifications
		: {};
	const primaryBinding = normalizeWechatBinding(source.primaryBinding);
	const future = normalizeFutureAccounts(source.future);

	return {
		...(primaryBinding ? { primaryBinding } : {}),
		notifications: {
			enabled: booleanOrDefault(notificationsSource.enabled, true),
			question: booleanOrDefault(notificationsSource.question, true),
			permission: booleanOrDefault(notificationsSource.permission, true),
			sessionError: booleanOrDefault(notificationsSource.sessionError, true),
			retryError: booleanOrDefault(notificationsSource.retryError, true),
		},
		...(future ? { future } : {}),
	};
}

export function normalizeWechatSettingsStore(
	input: unknown,
): WechatSettingsStore {
	const source = isRecord(input) ? input : {};
	return {
		wechat: normalizeWechatSettings(source.wechat),
	};
}

function migrateLegacySettings(input: unknown): WechatSettingsStore {
	const source = isRecord(input) ? input : {};
	const nestedWechat = normalizeWechatSettings(source.wechat);
	const notificationsSource =
		isRecord(source.wechat) && isRecord(source.wechat.notifications)
			? source.wechat.notifications
			: {};

	return {
		wechat: {
			...(nestedWechat.primaryBinding
				? { primaryBinding: nestedWechat.primaryBinding }
				: {}),
			notifications: {
				enabled: booleanOrDefault(
					notificationsSource.enabled,
					source.wechatNotificationsEnabled !== false,
				),
				question: booleanOrDefault(
					notificationsSource.question,
					source.wechatQuestionNotifyEnabled !== false,
				),
				permission: booleanOrDefault(
					notificationsSource.permission,
					source.wechatPermissionNotifyEnabled !== false,
				),
				sessionError: booleanOrDefault(
					notificationsSource.sessionError,
					source.wechatSessionErrorNotifyEnabled !== false,
				),
				retryError: booleanOrDefault(
					notificationsSource.retryError,
					source.wechatRetryErrorNotifyEnabled !== false,
				),
			},
			...(nestedWechat.future ? { future: nestedWechat.future } : {}),
		},
	};
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, fsConstants.F_OK);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

async function readJsonFile(filePath: string): Promise<unknown | undefined> {
	try {
		return JSON.parse(await readFile(filePath, "utf8")) as unknown;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

async function copyDirectory(source: string, target: string): Promise<void> {
	await mkdir(target, { recursive: true });
	const entries = await readdir(source, { withFileTypes: true });
	for (const entry of entries) {
		const sourcePath = path.join(source, entry.name);
		const targetPath = path.join(target, entry.name);
		if (entry.isDirectory()) {
			await copyDirectory(sourcePath, targetPath);
			continue;
		}
		if (entry.isFile()) {
			await mkdir(path.dirname(targetPath), { recursive: true });
			await copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL).catch(
				(error: NodeJS.ErrnoException) => {
					if (error.code !== "EEXIST") throw error;
				},
			);
		}
	}
}

async function copyLegacyPath(
	relativePath: string,
	targetPath: string,
): Promise<void> {
	const sourcePath = path.join(wechatLegacyConfigDir(), relativePath);
	let info: Awaited<ReturnType<typeof stat>>;
	try {
		info = await stat(sourcePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}

	if (info.isDirectory()) {
		await copyDirectory(sourcePath, targetPath);
		return;
	}
	if (info.isFile()) {
		await mkdir(path.dirname(targetPath), { recursive: true });
		await copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL).catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code !== "EEXIST") throw error;
			},
		);
	}
}

async function migrateLegacyWechatState(): Promise<void> {
	await mkdir(opencodeWechatConfigDir(), { recursive: true });
	for (const [relativePath, targetPath] of STATE_COPY_TARGETS) {
		await copyLegacyPath(relativePath, targetPath());
	}
}

export function settingsPath(): string {
	return wechatSettingsPath();
}

export async function readWechatSettingsStore(options?: {
	filePath?: string;
	legacySettingsFilePath?: string;
}): Promise<WechatSettingsStore> {
	const filePath = options?.filePath ?? wechatSettingsPath();
	const current = await readJsonFile(filePath);
	if (current !== undefined) {
		return normalizeWechatSettingsStore(current);
	}

	const legacyFilePath =
		options?.legacySettingsFilePath ?? wechatLegacySettingsPath();
	const legacy = await readJsonFile(legacyFilePath);
	const migrated = migrateLegacySettings(legacy);

	if (legacy !== undefined || (await pathExists(wechatLegacyConfigDir()))) {
		await migrateLegacyWechatState();
		await writeWechatSettingsStore(migrated, { filePath });
	}

	return migrated;
}

export function readWechatSettingsStoreSync(): WechatSettingsStore | undefined {
	return undefined;
}

export async function writeWechatSettingsStore(
	store: WechatSettingsStore,
	options?: { filePath?: string },
): Promise<void> {
	const filePath = options?.filePath ?? wechatSettingsPath();
	const normalized = normalizeWechatSettingsStore(store);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(normalized, null, 2), {
		mode: 0o600,
	});
}

export async function readWechatNotificationDispatchSettings(options?: {
	filePath?: string;
	legacySettingsFilePath?: string;
}): Promise<WechatNotificationDispatchSettings> {
	const settings = await readWechatSettingsStore(options);
	return {
		...(typeof settings.wechat.primaryBinding?.userId === "string"
			? { targetUserId: settings.wechat.primaryBinding.userId }
			: {}),
		...(typeof settings.wechat.primaryBinding?.accountId === "string"
			? { targetAccountId: settings.wechat.primaryBinding.accountId }
			: {}),
		notifications: settings.wechat.notifications,
	};
}

export type CommonSettingsStore = WechatSettingsStore;
export type WechatMenuSettings = WechatSettings;
export const readCommonSettingsStore = readWechatSettingsStore;
export const readCommonSettingsStoreSync = readWechatSettingsStoreSync;
export const writeCommonSettingsStore = writeWechatSettingsStore;
export const commonSettingsPath = settingsPath;
export const normalizeCommonSettingsStore = normalizeWechatSettingsStore;
