/**
 * output.ts — Format and emit command results.
 *
 * Every command returns a plain JS value. This module formats it based on
 * --output (json | toon) and optionally extracts a sub-value via --pick
 * (JSONPath expression).
 */

import { JSONPath } from "jsonpath-plus";

export type OutputFormat = "json" | "toon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyValue = any;

/**
 * Format `value` as a string ready for stdout.
 *
 * @param value  - Any serialisable value returned by a command
 * @param format - 'json' (default) or 'toon'
 * @param pick   - Optional JSONPath expression, e.g. "$.phases[*].name"
 */
export function formatOutput(
	value: AnyValue,
	format: OutputFormat,
	pick?: string,
): string {
	let data: AnyValue = value;

	if (pick) {
		const result = JSONPath({ path: pick, json: value as object, wrap: false });
		data = result;
	}

	if (format === "toon") {
		// @toon-format/toon may not ship types; import dynamically to avoid hard failure
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { encode } = require("@toon-format/toon") as {
			encode: (v: AnyValue) => string;
		};
		return encode(data);
	}

	return JSON.stringify(data, null, 2);
}
