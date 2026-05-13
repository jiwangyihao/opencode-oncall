import assert from "node:assert/strict";
import test from "node:test";

function createBrokerView() {
	return {
		connections: {
			"inst-1": {
				"inc-1": {
					instanceID: "inst-1",
					instanceIncarnation: "inc-1",
					online: true,
					lastEventSeq: 0,
					lastAckedEventSeq: 0,
					lastSentBrokerSeq: 0,
					connectedAt: 1710000000000,
				},
			},
		},
		active: {
			instances: {
				"inst-1": {
					instanceID: "inst-1",
					displayName: "WeChat driver instance",
					pid: 123,
					projectDir: "/repo/opencode-wechat",
					connectedAt: 1710000000000,
					online: true,
				},
			},
			sessions: {
				"inst-1:sess-1": {
					instanceID: "inst-1",
					sessionID: "sess-1",
					title: "Driver session",
					directory: "/repo/opencode-wechat",
					updatedAt: 1710000000500,
					status: "busy",
					pendingQuestionCount: 1,
					pendingPermissionCount: 1,
					todoSummary: { total: 2, inProgress: 1, completed: 1 },
					todoItems: [
						{ status: "in_progress", content: "等待微信回复" },
						{ status: "completed", content: "已发送通知" },
					],
					questionHighlights: ["问题：是否继续？"],
					highlights: [{ kind: "status", text: "正在等待远程处理" }],
				},
			},
			questions: {
				q1: {
					handle: "q1",
					requestID: "req-q1",
					scopeKey: "inst-1",
					sessionID: "sess-1",
					prompt: { title: "是否继续？" },
					createdAt: 1710000000100,
				},
			},
			permissions: {
				p1: {
					handle: "p1",
					requestID: "perm-p1",
					scopeKey: "inst-1",
					prompt: { title: "bash", description: "npm test" },
					createdAt: 1710000000200,
				},
			},
			naturalStops: {
				s1: {
					handle: "s1",
					redactedSummary: "Agent 等待补充信息",
					severityAdvice: "可以继续回复",
					createdAt: 1710000000300,
				},
			},
			retryErrors: {},
		},
		terminalMetadata: {},
		retainedOccupancy: {},
		commandLedger: {},
		legacyHandleClosures: {},
	};
}

test("wechat slash surface driver executes status, todo, reply, allow, and recover", async () => {
	const { createWechatSlashSurfaceDriver } = await import(
		`../dist/plugin-hooks.js?surface-${Date.now()}`
	);
	const questionReplies = [];
	const permissionReplies = [];
	const driver = createWechatSlashSurfaceDriver({
		readBrokerAuthoritativeView: async () => createBrokerView(),
		client: {
			question: {
				reply: async (input) => {
					questionReplies.push(input);
					return { data: { ok: true } };
				},
			},
			permission: {
				reply: async (input) => {
					permissionReplies.push(input);
					return { data: { ok: true } };
				},
			},
		},
	});

	const status = await driver.handleText("/status");
	assert.match(status, /^wechat status\n/);
	assert.match(status, /WeChat driver instance/);
	assert.match(status, /Driver session/);
	assert.match(status, /`#busy` `#todo:2` `#question:1` `#permission:1`/);
	assert.match(status, /\[-\] 等待微信回复/);
	assert.doesNotMatch(status, /instanceID|sessionID|createdAt/);

	const todo = await driver.handleText("/todo");
	assert.match(todo, /^待处理事项\n/);
	assert.match(todo, /QID：q1/);
	assert.match(todo, /回复：\/reply q1 你的回复/);
	assert.match(todo, /PID：p1/);
	assert.match(todo, /允许一次：\/allow p1 once/);
	assert.match(todo, /SID：s1/);

	assert.equal(await driver.handleText("/reply q1 hello"), "已回复问题：q1");
	assert.deepEqual(questionReplies, [
		{ requestID: "req-q1", answers: [["hello"]] },
	]);

	assert.equal(
		await driver.handleText("/allow p1 once"),
		"已处理权限请求：p1 (once)",
	);
	assert.deepEqual(permissionReplies, [
		{ requestID: "perm-p1", reply: "once" },
	]);

	assert.equal(await driver.handleText("/recover"), "没有可恢复的请求");
});

test("wechat slash surface driver rejects non-slash input with existing guard text", async () => {
	const { createWechatSlashSurfaceDriver } = await import(
		`../dist/plugin-hooks.js?guard-${Date.now()}`
	);
	const driver = createWechatSlashSurfaceDriver({
		readBrokerAuthoritativeView: async () => undefined,
	});
	assert.match(await driver.handleText("hello"), /请使用 slash 命令/);
});
