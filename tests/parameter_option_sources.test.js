import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	availableParameterOptionSourceAdapters,
	parameterOptionSourceAdapter,
	parameterOptionSourceOptions,
	refreshParameterOptionSources,
	registerParameterOptionSourceAdapter,
} from "../js/lib/parameter_option_sources.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the source adapter registry is exposed through the versioned public frontend API", () => {
	const publicApiSource = readFileSync(join(ROOT, "js", "api.js"), "utf8");
	assert.match(publicApiSource, /PARAMETER_OPTION_SOURCE_API_VERSION = 1/);
	assert.match(publicApiSource, /registerParameterOptionSourceAdapter/);
});

test("only detected non-empty option sources become selectable", () => {
	refreshParameterOptionSources({
		WDTimmTagger: {
			input: {
				required: {
					model_name: [["wd-vit-tagger-v3", "wd-swinv2-tagger-v3"], { default: "wd-vit-tagger-v3" }],
				},
			},
		},
		UpscaleModelLoader: {
			input: { required: { model_name: [[], {}] } },
		},
	});

	const available = availableParameterOptionSourceAdapters().map((adapter) => adapter.id);
	assert.equal(available.includes("wd_timm_model"), true);
	assert.equal(available.includes("upscale_model"), false);
	assert.deepEqual(parameterOptionSourceOptions("wd_timm_model"), ["wd-vit-tagger-v3", "wd-swinv2-tagger-v3"]);
});

test("a new option source is added through one adapter registration", () => {
	const unregister = registerParameterOptionSourceAdapter({
		id: "vendor_model",
		labelKey: "vendor.model",
		labelFallback: "Vendor model",
		inputs: [{ nodeName: "VendorLoader", inputName: "model" }],
	});
	try {
		refreshParameterOptionSources({
			VendorLoader: {
				inputs: {
					required: {
						model: ["COMBO", { options: ["alpha", "beta", "alpha"] }],
					},
				},
			},
		});
		assert.deepEqual(parameterOptionSourceOptions("vendor_model"), ["alpha", "beta"]);
		assert.deepEqual(parameterOptionSourceAdapter("vendor_model"), {
			id: "vendor_model",
			labelKey: "vendor.model",
			labelFallback: "Vendor model",
			available: true,
		});
	} finally {
		unregister();
	}
});

test("invalid or duplicate adapters fail explicitly", () => {
	assert.throws(
		() => registerParameterOptionSourceAdapter({ id: "Invalid source", inputs: [] }),
		/Invalid parameter option source id/,
	);
	assert.throws(
		() => registerParameterOptionSourceAdapter({
			id: "wd_timm_model",
			inputs: [{ nodeName: "OtherTagger", inputName: "model" }],
		}),
		/already registered/,
	);
});
