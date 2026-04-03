/**
 * frontmatter.ts — YAML frontmatter parsing, serialization, and CRUD commands.
 */

import fs from "fs";
import path from "path";
import { gsdError, normalizeMd, output, safeReadFile } from "./core.js";

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FrontmatterObject = Record<string, any>;

export type FrontmatterSchema = "plan" | "summary" | "verification";

export const FRONTMATTER_SCHEMAS: Record<
	FrontmatterSchema,
	{ required: string[] }
> = {
	plan: {
		required: [
			"phase",
			"plan",
			"type",
			"wave",
			"depends_on",
			"files_modified",
			"autonomous",
			"must_haves",
		],
	},
	summary: {
		required: ["phase", "plan", "subsystem", "tags", "duration", "completed"],
	},
	verification: { required: ["phase", "verified", "status", "score"] },
};

// ─── Parsing engine ───────────────────────────────────────────────────────────

export function extractFrontmatter(content: string): FrontmatterObject {
	const frontmatter: FrontmatterObject = {};
	// Find ALL frontmatter blocks at the start of the file.
	// If multiple blocks exist (corruption from CRLF mismatch), use the LAST one.
	const allBlocks = [
		...content.matchAll(/(?:^|\n)\s*---\r?\n([\s\S]+?)\r?\n---/g),
	];
	const match = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1] : null;
	if (!match) return frontmatter;

	const yaml = match[1];
	const lines = yaml.split(/\r?\n/);

	// Stack to track nested objects: [{obj, key, indent}]
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const stack: Array<{ obj: any; key: string | null; indent: number }> = [
		{ obj: frontmatter, key: null, indent: -1 },
	];

	for (const line of lines) {
		if (line.trim() === "") continue;

		const indentMatch = line.match(/^(\s*)/);
		const indent = indentMatch ? indentMatch[1].length : 0;

		while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
			stack.pop();
		}

		const current = stack[stack.length - 1];

		const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);
		if (keyMatch) {
			const key = keyMatch[2];
			const value = keyMatch[3].trim();

			if (value === "" || value === "[") {
				current.obj[key] = value === "[" ? [] : {};
				current.key = null;
				stack.push({ obj: current.obj[key], key: null, indent });
			} else if (value.startsWith("[") && value.endsWith("]")) {
				current.obj[key] = value
					.slice(1, -1)
					.split(",")
					.map((s) => s.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean);
				current.key = null;
			} else {
				current.obj[key] = value.replace(/^["']|["']$/g, "");
				current.key = null;
			}
		} else if (line.trim().startsWith("- ")) {
			const itemValue = line
				.trim()
				.slice(2)
				.replace(/^["']|["']$/g, "");

			if (
				typeof current.obj === "object" &&
				!Array.isArray(current.obj) &&
				Object.keys(current.obj).length === 0
			) {
				const parent = stack.length > 1 ? stack[stack.length - 2] : null;
				if (parent) {
					for (const k of Object.keys(parent.obj)) {
						if (parent.obj[k] === current.obj) {
							parent.obj[k] = [itemValue];
							current.obj = parent.obj[k];
							break;
						}
					}
				}
			} else if (Array.isArray(current.obj)) {
				current.obj.push(itemValue);
			}
		}
	}

	return frontmatter;
}

export function reconstructFrontmatter(obj: FrontmatterObject): string {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) continue;

		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${key}: []`);
			} else if (
				value.every((v) => typeof v === "string") &&
				value.length <= 3 &&
				value.join(", ").length < 60
			) {
				lines.push(`${key}: [${value.join(", ")}]`);
			} else {
				lines.push(`${key}:`);
				for (const item of value) {
					const s = String(item);
					lines.push(
						`  - ${typeof item === "string" && (s.includes(":") || s.includes("#")) ? `"${s}"` : s}`,
					);
				}
			}
		} else if (typeof value === "object") {
			lines.push(`${key}:`);
			for (const [subkey, subval] of Object.entries(value)) {
				if (subval === null || subval === undefined) continue;
				if (Array.isArray(subval)) {
					if (subval.length === 0) {
						lines.push(`  ${subkey}: []`);
					} else if (
						subval.every((v: unknown) => typeof v === "string") &&
						subval.length <= 3 &&
						(subval as string[]).join(", ").length < 60
					) {
						lines.push(`  ${subkey}: [${(subval as string[]).join(", ")}]`);
					} else {
						lines.push(`  ${subkey}:`);
						for (const item of subval) {
							lines.push(`    - ${item}`);
						}
					}
				} else if (typeof subval === "object") {
					lines.push(`  ${subkey}:`);
					for (const [subsubkey, subsubval] of Object.entries(
						subval as Record<string, unknown>,
					)) {
						if (subsubval === null || subsubval === undefined) continue;
						if (Array.isArray(subsubval)) {
							if (subsubval.length === 0) {
								lines.push(`    ${subsubkey}: []`);
							} else {
								lines.push(`    ${subsubkey}:`);
								for (const item of subsubval) lines.push(`      - ${item}`);
							}
						} else {
							lines.push(`    ${subsubkey}: ${subsubval}`);
						}
					}
				} else {
					const sv = String(subval);
					lines.push(
						`  ${subkey}: ${sv.includes(":") || sv.includes("#") ? `"${sv}"` : sv}`,
					);
				}
			}
		} else {
			const sv = String(value);
			if (
				sv.includes(":") ||
				sv.includes("#") ||
				sv.startsWith("[") ||
				sv.startsWith("{")
			) {
				lines.push(`${key}: "${sv}"`);
			} else {
				lines.push(`${key}: ${sv}`);
			}
		}
	}

	return lines.join("\n");
}

export function spliceFrontmatter(
	content: string,
	newObj: FrontmatterObject,
): string {
	const yamlStr = reconstructFrontmatter(newObj);
	const match = content.match(/^---\r?\n[\s\S]+?\r?\n---/);
	if (match) {
		return `---\n${yamlStr}\n---` + content.slice(match[0].length);
	}
	return `---\n${yamlStr}\n---\n\n` + content;
}

export function parseMustHavesBlock(
	content: string,
	blockName: string,
): unknown[] {
	const fmMatch = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
	if (!fmMatch) return [];

	const yaml = fmMatch[1];
	const mustHavesMatch = yaml.match(/^(\s*)must_haves:\s*$/m);
	if (!mustHavesMatch) return [];
	const mustHavesIndent = mustHavesMatch[1].length;

	const blockPattern = new RegExp(`^(\\s+)${blockName}:\\s*$`, "m");
	const blockMatch = yaml.match(blockPattern);
	if (!blockMatch) return [];

	const blockIndent = blockMatch[1].length;
	if (blockIndent <= mustHavesIndent) return [];

	const blockStart = yaml.indexOf(blockMatch[0]);
	if (blockStart === -1) return [];

	const afterBlock = yaml.slice(blockStart);
	const blockLines = afterBlock.split(/\r?\n/).slice(1);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const items: any[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let current: any = null;
	let listItemIndent = -1;

	for (const line of blockLines) {
		if (line.trim() === "") continue;
		const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
		if (indent <= blockIndent && line.trim() !== "") break;

		const trimmed = line.trim();

		if (trimmed.startsWith("- ")) {
			if (listItemIndent === -1) listItemIndent = indent;

			if (indent === listItemIndent) {
				if (current) items.push(current);
				current = {};
				const afterDash = trimmed.slice(2);
				if (!afterDash.includes(":")) {
					current = afterDash.replace(/^["']|["']$/g, "");
				} else {
					const kvMatch = afterDash.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
					if (kvMatch) {
						current = {};
						current[kvMatch[1]] = kvMatch[2];
					}
				}
				continue;
			}
		}

		if (current && typeof current === "object" && indent > listItemIndent) {
			if (trimmed.startsWith("- ")) {
				const arrVal = trimmed.slice(2).replace(/^["']|["']$/g, "");
				const keys = Object.keys(current);
				const lastKey = keys[keys.length - 1];
				if (lastKey && !Array.isArray(current[lastKey])) {
					current[lastKey] = current[lastKey] ? [current[lastKey]] : [];
				}
				if (lastKey) current[lastKey].push(arrVal);
			} else {
				const kvMatch = trimmed.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
				if (kvMatch) {
					const val = kvMatch[2];
					current[kvMatch[1]] = /^\d+$/.test(val) ? parseInt(val, 10) : val;
				}
			}
		}
	}
	if (current) items.push(current);

	return items;
}

// ─── Frontmatter CRUD commands ────────────────────────────────────────────────

export function cmdFrontmatterGet(
	cwd: string,
	filePath: string | undefined,
	field: string | null,
	raw: boolean,
): void {
	if (!filePath) {
		gsdError("file path required");
	}
	if (filePath.includes("\0")) {
		gsdError("file path contains null bytes");
	}
	const fullPath = path.isAbsolute(filePath)
		? filePath
		: path.join(cwd, filePath);
	const content = safeReadFile(fullPath);
	if (!content) {
		output({ error: "File not found", path: filePath }, raw);
		return;
	}
	const fm = extractFrontmatter(content);
	if (field) {
		const value = fm[field];
		if (value === undefined) {
			output({ error: "Field not found", field }, raw);
			return;
		}
		output({ [field]: value }, raw, JSON.stringify(value));
	} else {
		output(fm, raw);
	}
}

export function cmdFrontmatterSet(
	cwd: string,
	filePath: string | undefined,
	field: string | undefined,
	value: string | undefined,
	raw: boolean,
): void {
	if (!filePath || !field || value === undefined) {
		gsdError("file, field, and value required");
	}
	if (filePath.includes("\0")) {
		gsdError("file path contains null bytes");
	}
	const fullPath = path.isAbsolute(filePath)
		? filePath
		: path.join(cwd, filePath);
	if (!fs.existsSync(fullPath)) {
		output({ error: "File not found", path: filePath }, raw);
		return;
	}
	const content = fs.readFileSync(fullPath, "utf-8");
	const fm = extractFrontmatter(content);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let parsedValue: any;
	try {
		parsedValue = JSON.parse(value);
	} catch {
		parsedValue = value;
	}
	fm[field] = parsedValue;
	const newContent = spliceFrontmatter(content, fm);
	fs.writeFileSync(fullPath, normalizeMd(newContent), "utf-8");
	output({ updated: true, field, value: parsedValue }, raw, "true");
}

export function cmdFrontmatterMerge(
	cwd: string,
	filePath: string | undefined,
	data: string | undefined,
	raw: boolean,
): void {
	if (!filePath || !data) {
		gsdError("file and data required");
	}
	const fullPath = path.isAbsolute(filePath)
		? filePath
		: path.join(cwd, filePath);
	if (!fs.existsSync(fullPath)) {
		output({ error: "File not found", path: filePath }, raw);
		return;
	}
	const content = fs.readFileSync(fullPath, "utf-8");
	const fm = extractFrontmatter(content);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mergeData: Record<string, any>;
	try {
		mergeData = JSON.parse(data);
	} catch {
		gsdError("Invalid JSON for --data");
		return;
	}
	Object.assign(fm, mergeData);
	const newContent = spliceFrontmatter(content, fm);
	fs.writeFileSync(fullPath, normalizeMd(newContent), "utf-8");
	output({ merged: true, fields: Object.keys(mergeData) }, raw, "true");
}

export function cmdFrontmatterValidate(
	cwd: string,
	filePath: string | undefined,
	schemaName: string | undefined,
	raw: boolean,
): void {
	if (!filePath || !schemaName) {
		gsdError("file and schema required");
	}
	const schema = FRONTMATTER_SCHEMAS[schemaName as FrontmatterSchema];
	if (!schema) {
		gsdError(
			`Unknown schema: ${schemaName}. Available: ${Object.keys(FRONTMATTER_SCHEMAS).join(", ")}`,
		);
		return;
	}
	const fullPath = path.isAbsolute(filePath)
		? filePath
		: path.join(cwd, filePath);
	const content = safeReadFile(fullPath);
	if (!content) {
		output({ error: "File not found", path: filePath }, raw);
		return;
	}
	const fm = extractFrontmatter(content);
	const missing = schema.required.filter((f) => fm[f] === undefined);
	const present = schema.required.filter((f) => fm[f] !== undefined);
	output(
		{ valid: missing.length === 0, missing, present, schema: schemaName },
		raw,
		missing.length === 0 ? "valid" : "invalid",
	);
}
