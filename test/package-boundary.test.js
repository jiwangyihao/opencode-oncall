import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "fflate";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = path.join(projectRoot, "src");
const distRoot = path.join(projectRoot, "dist");
const npmCommand =
	process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const npmArgs = (args) =>
	process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;

async function execNpm(args, options) {
	return await execFileAsync(npmCommand, npmArgs(args), {
		windowsHide: true,
		...options,
	});
}

async function removeTreeWithRetry(
	targetPath,
	{ retries = 20, delayMs = 250 } = {},
) {
	let lastError;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			await rm(targetPath, {
				recursive: true,
				force: true,
				maxRetries: 3,
				retryDelay: delayMs,
			});
			return;
		} catch (error) {
			lastError = error;
			const retryable =
				error?.code === "EBUSY" ||
				error?.code === "ENOTEMPTY" ||
				error?.code === "EPERM";
			if (!retryable || attempt === retries) break;
			await new Promise((resolve) =>
				setTimeout(resolve, delayMs * (attempt + 1)),
			);
		}
	}

	throw lastError;
}

async function symlinkWithRetry(
	sourcePath,
	targetPath,
	type,
	{ retries = 20, delayMs = 250 } = {},
) {
	let lastError;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			await symlink(sourcePath, targetPath, type);
			return;
		} catch (error) {
			lastError = error;
			const retryable =
				error?.code === "EBUSY" ||
				error?.code === "EPERM" ||
				error?.code === "ENOTEMPTY";
			if (!retryable || attempt === retries) break;
			await new Promise((resolve) =>
				setTimeout(resolve, delayMs * (attempt + 1)),
			);
		}
	}

	throw lastError;
}

async function cleanupTempDirs(paths) {
	const errors = [];
	for (const targetPath of paths) {
		try {
			await removeTreeWithRetry(targetPath);
		} catch (error) {
			errors.push({ targetPath, error });
		}
	}
	for (const { targetPath, error } of errors) {
		process.emitWarning(
			`failed to remove temporary package smoke directory ${targetPath}: ${error.message}`,
			{ code: "OPENCODE_WECHAT_TEMP_CLEANUP" },
		);
	}
}

async function installPackedPackageWithLinkedDependencies({
	packageRoot,
	consumerDir,
	dependencies,
}) {
	const nodeModulesRoot = path.join(consumerDir, "node_modules");
	for (const dependencyName of Object.keys(dependencies ?? {})) {
		const sourceDependency = path.join(
			projectRoot,
			"node_modules",
			dependencyName,
		);
		const targetDependency = path.join(nodeModulesRoot, dependencyName);
		await mkdir(path.dirname(targetDependency), { recursive: true });
		await symlinkWithRetry(
			sourceDependency,
			targetDependency,
			process.platform === "win32" ? "junction" : "dir",
		);
	}

	const targetPackageRoot = path.join(nodeModulesRoot, "opencode-oncall");
	await cp(packageRoot, targetPackageRoot, {
		recursive: true,
		force: true,
		errorOnExist: false,
	});
	return targetPackageRoot;
}

const forbiddenRuntimePatterns = [
	"CopilotAccountSwitcher",
	"github-copilot",
	"COPILOT_PROVIDER_DESCRIPTOR",
	"createCopilotRetryingFetch",
	"modelAccountAssignments",
	"sync-copilot-upstream",
	"copilot-plugin.snapshot",
];

async function listFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) return listFiles(entryPath);
			if (entry.isFile()) return [entryPath];
			return [];
		}),
	);
	return files.flat();
}

async function findForbiddenMatches(directory, patterns) {
	const files = await listFiles(directory);
	const matches = [];
	for (const file of files) {
		const source = await readFile(file, "utf8");
		for (const pattern of patterns) {
			if (source.includes(pattern)) {
				matches.push(`${path.relative(projectRoot, file)}: ${pattern}`);
			}
		}
	}
	return matches;
}

async function npmPackJson(destination) {
	const { stdout } = await execNpm(
		["pack", "--json", "--pack-destination", destination],
		{
			cwd: projectRoot,
		},
	);
	const [packed] = JSON.parse(stdout);
	assert.ok(packed, "npm pack returned no package metadata");
	return packed;
}

async function unpackTarball(tarballPath, destination) {
	const archive = gunzipSync(await readFile(tarballPath));
	let offset = 0;

	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((value) => value === 0)) break;

		const rawName = Buffer.from(header.subarray(0, 100))
			.toString("utf8")
			.replace(/\0.*$/u, "");
		const rawSize = Buffer.from(header.subarray(124, 136))
			.toString("utf8")
			.replace(/\0.*$/u, "")
			.trim();
		const typeFlag = String.fromCharCode(header[156]);
		const size = Number.parseInt(rawSize || "0", 8);
		const contentStart = offset + 512;
		const contentEnd = contentStart + size;

		if (rawName && typeFlag !== "5") {
			const entryPath = path.join(destination, ...rawName.split("/"));
			await mkdir(path.dirname(entryPath), { recursive: true });
			await writeFile(entryPath, archive.subarray(contentStart, contentEnd));
		}

		offset = contentStart + Math.ceil(size / 512) * 512;
	}
}

async function readProjectPackageJson() {
	return JSON.parse(
		await readFile(path.join(projectRoot, "package.json"), "utf8"),
	);
}

function expectedPackageMetadata(pkg) {
	return {
		name: pkg.name,
		version: pkg.version,
		main: pkg.main,
		types: pkg.types,
		files: pkg.files,
	};
}

function assertPackageMetadata(actual, expected) {
	assert.equal(actual.name, expected.name);
	assert.equal(actual.version, expected.version);
	assert.equal(actual.main, expected.main);
	assert.equal(actual.types, expected.types);
	assert.deepEqual(actual.files, expected.files);
}

test("package metadata targets opencode-oncall", async () => {
	const pkg = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8"),
	);
	assert.equal(pkg.name, "opencode-oncall");
	assert.equal(pkg.version, "0.1.1");
	assert.equal(
		pkg.description,
		"Remote on-call UX plugin for OpenCode over WeChat",
	);
	assert.deepEqual(pkg.files, ["dist/", "README.md", "LICENSE"]);
	assert.equal(pkg.dependencies["@tencent-weixin/openclaw-weixin"], "2.0.1");
	assert.equal(pkg.dependencies.openclaw, "2026.3.22");
	assert.equal(pkg.dependencies["@opencode-ai/plugin"], "^1.2.26");
	assert.equal(pkg.dependencies["@opencode-ai/sdk"], "^1.2.26");
	assert.equal(pkg.devDependencies.typescript, "^5.0.0");
	assert.equal(pkg.dependencies["github-copilot"], undefined);
});

test("runtime source excludes Copilot package remnants", async () => {
	const matches = await findForbiddenMatches(
		sourceRoot,
		forbiddenRuntimePatterns,
	);
	assert.deepEqual(matches, []);
});

test("built dist excludes Copilot package remnants", async () => {
	const matches = await findForbiddenMatches(
		distRoot,
		forbiddenRuntimePatterns,
	);
	assert.deepEqual(matches, []);
});

test("npm pack contains only the public package boundary", async () => {
	const tempDir = await mkdtemp(
		path.join(os.tmpdir(), "opencode-oncall-pack-"),
	);
	try {
		const packed = await npmPackJson(tempDir);
		const files = packed.files.map((file) => file.path).sort();

		assert.equal(packed.name, "opencode-oncall");
		assert.equal(packed.version, "0.1.1");
		assert.equal(files.includes("package.json"), true);
		assert.equal(files.includes("README.md"), true);
		assert.equal(files.includes("LICENSE"), true);
		assert.equal(files.includes("dist/index.js"), true);
		assert.equal(files.includes("dist/index.d.ts"), true);
		assert.equal(
			files.some((file) => file.startsWith("src/")),
			false,
		);
		assert.equal(
			files.some((file) => file.startsWith("test/")),
			false,
		);
		assert.equal(
			files.some((file) => file.startsWith("scripts/")),
			false,
		);
		assert.equal(
			files.some((file) =>
				forbiddenRuntimePatterns.some((pattern) => file.includes(pattern)),
			),
			false,
		);
	} finally {
		await removeTreeWithRetry(tempDir);
	}
});

test("packed tarball installs in a temporary consumer and exposes only OpenCodeWechat root exports", async () => {
	const packDir = await mkdtemp(
		path.join(os.tmpdir(), "opencode-oncall-pack-"),
	);
	const consumerDir = await mkdtemp(
		path.join(os.tmpdir(), "opencode-oncall-consumer-"),
	);
	try {
		const projectPkg = await readProjectPackageJson();
		const expectedMetadata = expectedPackageMetadata(projectPkg);
		const packed = await npmPackJson(packDir);
		const tarballPath = path.join(packDir, packed.filename);
		await unpackTarball(tarballPath, packDir);

		assert.equal(packed.name, expectedMetadata.name);
		assert.equal(packed.version, expectedMetadata.version);

		const installedPackageRoot =
			await installPackedPackageWithLinkedDependencies({
				packageRoot: path.join(packDir, "package"),
				consumerDir,
				dependencies: projectPkg.dependencies,
			});
		const installedPkg = JSON.parse(
			await readFile(path.join(installedPackageRoot, "package.json"), "utf8"),
		);
		assertPackageMetadata(installedPkg, expectedMetadata);

		const driver = path.join(consumerDir, "driver.mjs");
		await writeFile(
			driver,
			`
      import * as entry from "opencode-oncall";
      import assert from "node:assert/strict";
      assert.deepEqual(Object.keys(entry).sort(), ["OpenCodeWechat", "default"]);
      assert.equal(entry.default, entry.OpenCodeWechat);
      assert.equal(typeof entry.OpenCodeWechat, "function");
    `,
		);
		await execFileAsync(process.execPath, [driver], {
			cwd: consumerDir,
			windowsHide: true,
		});
	} finally {
		await cleanupTempDirs([packDir, consumerDir]);
	}
});
