import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexSourceUrl = new URL("../src/index.ts", import.meta.url);

function parseExportedNames(source) {
	const names = new Set();
	for (const match of source.matchAll(
		/export\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/g,
	)) {
		for (const rawPart of match[1].split(",")) {
			const part = rawPart.trim();
			if (!part) continue;
			const aliasMatch = part.match(/^(\w+)\s+as\s+(\w+)$/);
			names.add(aliasMatch ? aliasMatch[2] : part);
		}
	}
	return [...names].sort();
}

test("source entry exports only OpenCodeWechat and default", async () => {
	const source = await readFile(indexSourceUrl, "utf8");
	assert.deepEqual(parseExportedNames(source), ["OpenCodeWechat", "default"]);
	assert.doesNotMatch(
		source,
		/CopilotAccountSwitcher|OpenAICodexAccountSwitcher|COPILOT_PROVIDER_DESCRIPTOR/,
	);
});

test("wechat plugin settings entry metadata is stable", async () => {
	const { buildWechatSettingsMenuEntry } = await import(
		`../dist/ui/wechat-menu.js?entry-${Date.now()}`
	);
	assert.deepEqual(buildWechatSettingsMenuEntry(), {
		title: "OpenCode WeChat",
		value: "opencode-wechat.settings",
		category: "OpenCode",
	});
});

test("wechat plugin exposes settings entry through plugin seam", async () => {
	const { buildWechatSettingsMenuEntry: buildFromMenu } = await import(
		`../dist/ui/wechat-menu.js?menu-${Date.now()}`
	);
	const { buildWechatPluginMetadata } = await import(
		`../dist/plugin.js?plugin-${Date.now()}`
	);
	assert.deepEqual(buildWechatPluginMetadata().settingsEntry, buildFromMenu());
});

test("default plugin factory can be imported and called", async () => {
	const { default: pluginFactory, OpenCodeWechat } = await import(
		`../dist/index.js?factory-${Date.now()}`
	);
	assert.equal(pluginFactory, OpenCodeWechat);
	const hooks = await pluginFactory({});
	assert.equal(typeof hooks.config, "function");
	assert.equal(typeof hooks["wechat.slash.handle"], "function");
});
