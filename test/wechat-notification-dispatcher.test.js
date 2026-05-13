import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { setupIsolatedWechatStateRoot } from "./helpers/wechat-state-root.js";

async function writeSettings(configHome, notifications) {
	const configDir = path.join(configHome, "opencode", "opencode-wechat");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		path.join(configDir, "settings.json"),
		JSON.stringify({
			wechat: {
				primaryBinding: { accountId: "wechat-main", userId: "user-main" },
				notifications,
			},
		}),
	);
}

test("wechat notification dispatcher uses retryError switch independently from sessionError", async () => {
	const isolated = await setupIsolatedWechatStateRoot(
		"wechat-notification-dispatcher-retry-",
	);

	try {
		await writeSettings(isolated.sandboxConfigHome, {
			enabled: true,
			question: true,
			permission: true,
			sessionError: false,
			retryError: true,
		});

		const notificationStore = await import(
			"../dist/wechat/notification-store.js"
		);
		await notificationStore.upsertNotification({
			idempotencyKey: "ordinary-session-error",
			kind: "sessionError",
			wechatAccountId: "wechat-main",
			userId: "user-main",
			sessionID: "session-ordinary",
			redactedSummary: "普通会话异常",
			severityAdvice: "请人工查看",
			createdAt: 1713000000000,
		});
		await notificationStore.upsertNotification({
			idempotencyKey: "retry-session-error",
			kind: "sessionError",
			source: "retryError",
			wechatAccountId: "wechat-main",
			userId: "user-main",
			sessionID: "session-retry",
			action: "自动重试第 1 次",
			redactedSummary: "重试失败",
			severityAdvice: "可等待自动重试",
			createdAt: 1713000000001,
		});

		const sent = [];
		const { createWechatNotificationDispatcher } = await import(
			"../dist/wechat/notification-dispatcher.js"
		);
		const dispatcher = createWechatNotificationDispatcher({
			sendMessage: async (message) => {
				sent.push(message);
			},
		});

		await dispatcher.drainOutboundMessages();

		assert.equal(sent.length, 1);
		assert.match(sent[0].text, /重试失败/);
	} finally {
		await isolated.restore();
	}
});
