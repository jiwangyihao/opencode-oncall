import assert from "node:assert/strict";
import test from "node:test";

function createSettings() {
	return {
		wechat: {
			notifications: {
				enabled: true,
				question: true,
				permission: true,
				sessionError: true,
				retryError: true,
			},
		},
	};
}

test("WeChat menu toggle action ids are accepted by common settings actions", async () => {
	const { buildWechatMenuItems } = await import(
		`../dist/ui/wechat-menu.js?menu-actions-${Date.now()}`
	);
	const { applyCommonSettingsAction } = await import(
		`../dist/common-settings-actions.js?menu-actions-${Date.now()}`
	);
	const settings = createSettings();
	const toggleActions = buildWechatMenuItems({ settings })
		.map((item) => item.value)
		.filter((value) => value.startsWith("toggle-wechat-"));
	const writes = [];

	assert.deepEqual(toggleActions, [
		"toggle-wechat-notifications",
		"toggle-wechat-question-notifications",
		"toggle-wechat-permission-notifications",
		"toggle-wechat-session-error-notifications",
		"toggle-wechat-retry-error-notifications",
	]);

	for (const actionType of toggleActions) {
		const actionSettings = createSettings();
		const handled = await applyCommonSettingsAction({
			action: { type: actionType },
			readSettings: async () => actionSettings,
			writeSettings: async (nextSettings, meta) => {
				writes.push({ actionType, nextSettings, meta });
			},
		});
		assert.equal(handled, true, `${actionType} should be handled`);
	}

	assert.deepEqual(
		writes.map((write) => write.meta.actionType),
		toggleActions,
	);
	assert.equal(writes[0].nextSettings.wechat.notifications.enabled, false);
	assert.equal(writes[1].nextSettings.wechat.notifications.question, false);
	assert.equal(writes[2].nextSettings.wechat.notifications.permission, false);
	assert.equal(writes[3].nextSettings.wechat.notifications.sessionError, false);
	assert.equal(writes[4].nextSettings.wechat.notifications.retryError, false);
});
