import type { Hooks } from "@opencode-ai/plugin";
import type { TextPart } from "@opencode-ai/sdk";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import type { WechatBridgeLifecycleInput } from "./wechat/bridge.js";
import { createWechatBridgeLifecycle } from "./wechat/bridge.js";
import { createBrokerWechatSlashCommandHandler } from "./wechat/broker-entry.js";
import type { BrokerAuthoritativeView } from "./wechat/broker-state-store.js";
import type { WechatSlashCommand } from "./wechat/command-parser.js";
import { parseWechatSlashCommand } from "./wechat/command-parser.js";
import { STAGE_A_SLASH_ONLY_MESSAGE } from "./wechat/compat/slash-guard.js";
import type { WechatNotificationSendInput } from "./wechat/notification-dispatcher.js";
import { createWechatNotificationDispatcher } from "./wechat/notification-dispatcher.js";

export type WechatPluginHooks = Hooks & {
	"wechat.slash.handle"?: (input: { text: string }) => Promise<string>;
};

type BridgeClient = WechatBridgeLifecycleInput["client"];
type BridgeLifecycle = Awaited<ReturnType<typeof createWechatBridgeLifecycle>>;

type BridgeState = {
	key: string;
	promise: Promise<BridgeLifecycle>;
	lifecycle?: BridgeLifecycle;
	closeRequested: boolean;
	closePromise?: Promise<void>;
};

type BridgeSessionState = {
	key: string;
	selectedSessionID?: string;
	interactedSessionID?: string;
};

type AutoCloseListeners = {
	beforeExit: () => void;
	sigint: () => void;
	sigterm: () => void;
};

type BridgeGlobalState = {
	lifecycleState?: BridgeState;
	sessionState?: BridgeSessionState;
	autoCloseListeners?: AutoCloseListeners;
};

type OpencodeSdkClientSeam = {
	_client?: unknown;
	session: {
		list: (parameters?: { directory?: string }) => Promise<unknown>;
		status: (parameters?: { directory?: string }) => Promise<unknown>;
		todo: (parameters: {
			sessionID: string;
			directory?: string;
		}) => Promise<unknown>;
		messages: (parameters: {
			sessionID: string;
			limit?: number;
			directory?: string;
		}) => Promise<unknown>;
		command: (parameters: {
			sessionID: string;
			command: string;
			arguments?: string;
			directory?: string;
		}) => Promise<unknown>;
	};
	question: {
		list: (parameters?: { directory?: string }) => Promise<unknown>;
		reply: (parameters: {
			requestID: string;
			answers?: unknown[];
			directory?: string;
		}) => Promise<unknown>;
	};
	permission: {
		list: (parameters?: { directory?: string }) => Promise<unknown>;
		reply: (parameters: {
			requestID: string;
			reply?: "once" | "always" | "reject";
			message?: string;
			directory?: string;
		}) => Promise<unknown>;
	};
};

export type BuildPluginHooksInput = {
	[key: string]: unknown;
	client?: unknown;
	project?: { id?: string; name?: string };
	directory?: string;
	serverUrl?: URL;
	initialWechatBrokerPromise?: WechatBridgeLifecycleInput["initialBrokerPromise"];
	createWechatBridgeLifecycleImpl?: (
		input: WechatBridgeLifecycleInput,
	) => Promise<BridgeLifecycle>;
	readBrokerAuthoritativeView?: SlashDriverInput["readBrokerAuthoritativeView"];
	readBrokerCommandStateByAction?: SlashDriverInput["readBrokerCommandStateByAction"];
	notificationSendMessage?: (
		input: WechatNotificationSendInput,
	) => Promise<unknown>;
	onFallbackToast?: WechatBridgeLifecycleInput["onFallbackToast"];
};

type SlashDriverInput = {
	readBrokerAuthoritativeView: () =>
		| Promise<BrokerAuthoritativeView | undefined>
		| BrokerAuthoritativeView
		| undefined;
	readBrokerCommandStateByAction?: Parameters<
		typeof createBrokerWechatSlashCommandHandler
	>[0]["readBrokerCommandStateByAction"];
	client?: Parameters<
		typeof createBrokerWechatSlashCommandHandler
	>[0]["client"];
	sendReplyQuestionRpc?: Parameters<
		typeof createBrokerWechatSlashCommandHandler
	>[0]["sendReplyQuestionRpc"];
	sendReplyPermissionRpc?: Parameters<
		typeof createBrokerWechatSlashCommandHandler
	>[0]["sendReplyPermissionRpc"];
	sendReplyNaturalStopRpc?: Parameters<
		typeof createBrokerWechatSlashCommandHandler
	>[0]["sendReplyNaturalStopRpc"];
	directory?: string;
};

const BRIDGE_GLOBAL_STATE_KEY = Symbol.for(
	"opencode-wechat.bridge-global-state",
);

function getBridgeGlobalState(): BridgeGlobalState {
	const globalState = globalThis as typeof globalThis & {
		[BRIDGE_GLOBAL_STATE_KEY]?: BridgeGlobalState;
	};
	globalState[BRIDGE_GLOBAL_STATE_KEY] ??= {};
	return globalState[BRIDGE_GLOBAL_STATE_KEY];
}

function closeBridgeState(state: BridgeState): Promise<void> {
	state.closeRequested = true;
	state.closePromise ??= state.promise
		.then((lifecycle) => lifecycle.close())
		.catch(() => {});
	return state.closePromise;
}

function ensureBridgeSessionState(key: string): BridgeSessionState {
	const globalState = getBridgeGlobalState();
	if (globalState.sessionState?.key === key) return globalState.sessionState;
	const state: BridgeSessionState = { key };
	globalState.sessionState = state;
	return state;
}

function trackSelectedSession(
	state: BridgeSessionState | undefined,
	sessionID: unknown,
) {
	if (!state || typeof sessionID !== "string" || sessionID.length === 0) return;
	state.selectedSessionID = sessionID;
}

function trackInteractedSession(
	state: BridgeSessionState | undefined,
	sessionID: unknown,
) {
	if (!state || typeof sessionID !== "string" || sessionID.length === 0) return;
	state.interactedSessionID = sessionID;
}

function getActiveSessionID(
	state: BridgeSessionState | undefined,
): string | undefined {
	return state?.selectedSessionID ?? state?.interactedSessionID;
}

function handleBridgeEvent(
	state: BridgeSessionState | undefined,
	event: unknown,
) {
	if (!state || !event || typeof event !== "object") return;
	const payload = event as {
		type?: unknown;
		properties?: { sessionID?: unknown };
	};
	if (payload.type === "tui.session.select") {
		trackSelectedSession(state, payload.properties?.sessionID);
	}
}

function hasBridgeClientShape(value: unknown): value is BridgeClient {
	const client = value as Partial<BridgeClient> | undefined;
	return Boolean(
		client &&
			typeof client === "object" &&
			typeof client.session?.list === "function" &&
			typeof client.session?.status === "function" &&
			typeof client.session?.todo === "function" &&
			typeof client.session?.messages === "function" &&
			typeof client.question?.list === "function" &&
			typeof client.permission?.list === "function",
	);
}

function toBridgeClient(
	value: unknown,
	serverUrl?: URL,
	directory?: string,
): BridgeClient | undefined {
	if (hasBridgeClientShape(value)) return value;
	if (!serverUrl) return undefined;

	const client = createOpencodeClient({
		baseUrl: serverUrl.toString(),
	}) as unknown as OpencodeSdkClientSeam;

	const withDirectory = directory ? { directory } : undefined;
	const wrapped = {
		client: client._client,
		session: {
			list: () => client.session.list(withDirectory),
			status: () => client.session.status(withDirectory),
			todo: (parameters: { sessionID: string } | string) => {
				const sessionID =
					typeof parameters === "string" ? parameters : parameters.sessionID;
				return client.session.todo({ sessionID, ...withDirectory });
			},
			messages: (
				parameters: { sessionID: string; limit?: number } | string,
			) => {
				const sessionID =
					typeof parameters === "string" ? parameters : parameters.sessionID;
				const limit =
					typeof parameters === "string" ? undefined : parameters.limit;
				return client.session.messages({ sessionID, limit, ...withDirectory });
			},
			reply: (input: { sessionID: string; text: string }) =>
				client.session.command({
					sessionID: input.sessionID,
					command: input.text,
					arguments: "",
					...withDirectory,
				}),
		},
		question: {
			list: () => client.question.list(withDirectory),
			reply: (input: { requestID: string; answers: unknown[] }) =>
				client.question.reply({
					requestID: input.requestID,
					answers: input.answers,
					...withDirectory,
				}),
		},
		permission: {
			list: () => client.permission.list(withDirectory),
			reply: (input: {
				requestID: string;
				reply: "once" | "always" | "reject";
				message?: string;
			}) =>
				client.permission.reply({
					requestID: input.requestID,
					reply: input.reply,
					message: input.message,
					...withDirectory,
				}),
		},
	};
	return hasBridgeClientShape(wrapped) ? wrapped : undefined;
}

function buildBridgeKey(input: {
	directory?: string;
	serverUrl?: URL;
	project?: { id?: string; name?: string };
}) {
	return [
		input.directory ?? "",
		input.serverUrl?.toString() ?? "",
		input.project?.id ?? input.project?.name ?? "",
	].join("\u0000");
}

function attachBridgeAutoClose() {
	const globalState = getBridgeGlobalState();
	if (globalState.autoCloseListeners) return;
	const close = () => {
		const state = getBridgeGlobalState().lifecycleState;
		if (state) closeBridgeState(state);
	};
	const listeners: AutoCloseListeners = {
		beforeExit: close,
		sigint: close,
		sigterm: close,
	};
	globalState.autoCloseListeners = listeners;
	process.once("beforeExit", listeners.beforeExit);
	process.once("SIGINT", listeners.sigint);
	process.once("SIGTERM", listeners.sigterm);
}

function detachBridgeAutoClose(globalState: BridgeGlobalState) {
	const listeners = globalState.autoCloseListeners;
	if (!listeners) return;
	process.removeListener("beforeExit", listeners.beforeExit);
	process.removeListener("SIGINT", listeners.sigint);
	process.removeListener("SIGTERM", listeners.sigterm);
	delete globalState.autoCloseListeners;
}

function ensureBridgeLifecycle(input: {
	key: string;
	create: () => Promise<BridgeLifecycle>;
}) {
	const globalState = getBridgeGlobalState();
	const current = globalState.lifecycleState;
	if (current?.key === input.key) return current.promise;
	if (current) closeBridgeState(current);

	const state: BridgeState = {
		key: input.key,
		closeRequested: false,
		promise: Promise.resolve().then(input.create),
	};
	globalState.lifecycleState = state;
	state.promise
		.then((lifecycle) => {
			state.lifecycle = lifecycle;
			if (
				state.closeRequested ||
				getBridgeGlobalState().lifecycleState !== state
			) {
				void closeBridgeState(state);
			}
			return lifecycle;
		})
		.catch(() => {
			if (getBridgeGlobalState().lifecycleState === state) {
				delete getBridgeGlobalState().lifecycleState;
			}
		});
	return state.promise;
}

export async function resetWechatBridgeGlobalsForTest() {
	const globalState = getBridgeGlobalState();
	const current = globalState.lifecycleState;
	delete globalState.lifecycleState;
	delete globalState.sessionState;
	detachBridgeAutoClose(globalState);
	if (current) {
		await closeBridgeState(current);
	}
}

export function isBridgeCapableBrokerOwnerInput(input: {
	client?: unknown;
	serverUrl?: URL;
	directory?: string;
}): boolean {
	return Boolean(
		toBridgeClient(input.client, input.serverUrl, input.directory),
	);
}

export function createWechatSlashSurfaceDriver(input: SlashDriverInput) {
	const handler = createBrokerWechatSlashCommandHandler({
		readBrokerAuthoritativeView: input.readBrokerAuthoritativeView,
		readBrokerCommandStateByAction: input.readBrokerCommandStateByAction,
		client: input.client,
		sendReplyQuestionRpc: input.sendReplyQuestionRpc,
		sendReplyPermissionRpc: input.sendReplyPermissionRpc,
		sendReplyNaturalStopRpc: input.sendReplyNaturalStopRpc,
		directory: input.directory,
	});

	return {
		handleCommand: handler,
		async handleText(text: string): Promise<string> {
			const command = parseWechatSlashCommand(text);
			if (!command) return STAGE_A_SLASH_ONLY_MESSAGE;
			return handler(command);
		},
	};
}

export function buildWechatSlashHandlers(
	input: SlashDriverInput,
): Record<
	WechatSlashCommand["type"],
	(command: WechatSlashCommand) => Promise<string>
> {
	const driver = createWechatSlashSurfaceDriver(input);
	return {
		allow: (command) => driver.handleCommand(command),
		recover: (command) => driver.handleCommand(command),
		reply: (command) => driver.handleCommand(command),
		status: (command) => driver.handleCommand(command),
		todo: (command) => driver.handleCommand(command),
	};
}

function createTextPart(text: string): TextPart {
	return {
		id: "opencode-wechat-slash-reply",
		sessionID: "opencode-wechat",
		messageID: "opencode-wechat-slash-reply",
		type: "text",
		text,
		synthetic: true,
	};
}

export function buildPluginHooks(
	input: BuildPluginHooksInput = {},
): WechatPluginHooks {
	const bridgeClient = toBridgeClient(
		input.client,
		input.serverUrl,
		input.directory,
	);
	const createBridgeLifecycle =
		input.createWechatBridgeLifecycleImpl ?? createWechatBridgeLifecycle;
	const bridgeKey = bridgeClient ? buildBridgeKey(input) : undefined;
	const bridgeSessionState = bridgeKey
		? ensureBridgeSessionState(bridgeKey)
		: undefined;

	if (bridgeClient && bridgeKey) {
		attachBridgeAutoClose();
		void ensureBridgeLifecycle({
			key: bridgeKey,
			create: () =>
				createBridgeLifecycle({
					client: bridgeClient,
					project: input.project,
					directory: input.directory,
					serverUrl: input.serverUrl,
					initialBrokerPromise: input.initialWechatBrokerPromise,
					statusCollectionEnabled: true,
					getActiveSessionID: () => getActiveSessionID(bridgeSessionState),
					onFallbackToast: input.onFallbackToast,
				}),
		}).catch(() => {});
	}

	const slashDriver = createWechatSlashSurfaceDriver({
		readBrokerAuthoritativeView:
			input.readBrokerAuthoritativeView ?? (() => undefined),
		readBrokerCommandStateByAction: input.readBrokerCommandStateByAction,
		directory: input.directory,
	});

	const dispatcher = input.notificationSendMessage
		? createWechatNotificationDispatcher({
				sendMessage: input.notificationSendMessage,
			})
		: undefined;

	return {
		async event(eventInput) {
			handleBridgeEvent(bridgeSessionState, eventInput.event);
		},
		async "command.execute.before"(hookInput, output) {
			trackInteractedSession(bridgeSessionState, hookInput.sessionID);
			if (!hookInput.command.startsWith("/")) return;
			const reply = await slashDriver.handleText(
				`${hookInput.command} ${hookInput.arguments}`.trim(),
			);
			output.parts.push(createTextPart(reply));
		},
		async config(config) {
			config.command ??= {};
		},
		async "tool.execute.before"(hookInput) {
			trackInteractedSession(bridgeSessionState, hookInput.sessionID);
		},
		async "wechat.slash.handle"(hookInput) {
			return slashDriver.handleText(hookInput.text);
		},
		...(dispatcher
			? {
					async "tool.execute.after"() {
						await dispatcher.drainOutboundMessages();
					},
				}
			: {}),
	};
}
