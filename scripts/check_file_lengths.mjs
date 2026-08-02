import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TARGET_LINES = 600;
export const HARD_LIMIT_LINES = 800;

const CODE_EXTENSIONS = new Set([
	".cjs", ".css", ".js", ".jsx", ".mjs", ".py", ".scss", ".ts", ".tsx", ".vue",
]);
const IGNORED_DIRECTORY_NAMES = new Set([
	".cache", ".git", ".venv", "__pycache__", "build", "coverage", "dist", "node_modules", "venv",
]);
const EXACT_IGNORED_PREFIXES = ["js/vendor/"];

export function countPhysicalLines(source) {
	if (!source) return 0;
	const lines = source.split(/\r\n|\n|\r/).length;
	return /(?:\r\n|\n|\r)$/.test(source) ? lines - 1 : lines;
}

export function normalizeProjectPath(value) {
	return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isCheckedCodePath(value) {
	const path = normalizeProjectPath(value);
	if (!CODE_EXTENSIONS.has(extname(path).toLowerCase())) return false;
	if (EXACT_IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
	return !path.split("/").some((segment) => IGNORED_DIRECTORY_NAMES.has(segment));
}

export function collectCodeFiles(root) {
	const files = [];
	function visit(directory) {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
			const absolute = join(directory, entry.name);
			const projectPath = normalizeProjectPath(relative(root, absolute));
			if (entry.isDirectory()) {
				if (!EXACT_IGNORED_PREFIXES.some((prefix) => `${projectPath}/`.startsWith(prefix))) visit(absolute);
			} else if (entry.isFile() && isCheckedCodePath(projectPath)) {
				files.push({ absolute, path: projectPath });
			}
		}
	}
	visit(root);
	return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function inspectCodeFileLengths(root) {
	return collectCodeFiles(root).map((file) => ({
		path: file.path,
		lines: countPhysicalLines(readFileSync(file.absolute, "utf8")),
	}));
}

export function classifyCodeFileLengths(entries) {
	const bySeverity = (left, right) => (right.lines - left.lines) || left.path.localeCompare(right.path);
	return {
		warnings: entries.filter((entry) => entry.lines > TARGET_LINES && entry.lines <= HARD_LIMIT_LINES).sort(bySeverity),
		violations: entries.filter((entry) => entry.lines > HARD_LIMIT_LINES).sort(bySeverity),
	};
}

export function formatLengthEntry(entry, limit) {
	return `- ${entry.path}: ${entry.lines} lines (limit ${limit}, over ${entry.lines - limit})`;
}

export function runCodeFileLengthCheck(root) {
	const entries = inspectCodeFileLengths(root);
	const { warnings, violations } = classifyCodeFileLengths(entries);
	if (warnings.length) {
		console.warn(`Code files above the ${TARGET_LINES}-line modularity target:`);
		for (const entry of warnings) console.warn(formatLengthEntry(entry, TARGET_LINES));
	}
	if (violations.length) {
		console.error(`Code file hard limit exceeded (${HARD_LIMIT_LINES} physical lines):`);
		for (const entry of violations) console.error(formatLengthEntry(entry, HARD_LIMIT_LINES));
		console.error("Split by cohesive responsibility; do not compress formatting or remove useful comments to evade the check.");
	}
	if (!warnings.length && !violations.length) {
		console.log(`Code file lengths OK (${entries.length} files, target ${TARGET_LINES}, hard limit ${HARD_LIMIT_LINES}).`);
	}
	return { entries, warnings, violations };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)));
	const result = runCodeFileLengthCheck(root);
	if (result.violations.length) process.exitCode = 1;
}
