import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDirectory = resolve(root, "js/vendor");

const packages = [
	{
		name: "marked",
		artifacts: [
			["lib/marked.esm.js", "marked.esm.js"],
			["LICENSE.md", "marked.LICENSE.md"],
		],
	},
	{
		name: "dompurify",
		artifacts: [
			["dist/purify.es.mjs", "purify.es.js"],
			["LICENSE", "dompurify.LICENSE"],
			["LICENSE-MPL", "dompurify.LICENSE-MPL"],
		],
	},
];

await mkdir(vendorDirectory, { recursive: true });

const versions = {};
for (const entry of packages) {
	const packageDirectory = resolve(root, "node_modules", entry.name);
	const packageJson = JSON.parse(await readFile(resolve(packageDirectory, "package.json"), "utf8"));
	versions[entry.name] = {
		version: packageJson.version,
		license: packageJson.license,
	};
	for (const [source, target] of entry.artifacts) {
		const targetPath = resolve(vendorDirectory, target);
		await copyFile(resolve(packageDirectory, source), targetPath);
		if (target.includes("LICENSE")) {
			const license = await readFile(targetPath, "utf8");
			await writeFile(targetPath, license.replace(/[ \t]+$/gm, ""), "utf8");
		}
	}
}

await writeFile(resolve(vendorDirectory, "versions.json"), `${JSON.stringify(versions, null, 2)}\n`, "utf8");
