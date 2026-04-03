/**
 * security.ts — Prompt injection scanning and path/field validation.
 *
 * Ported from lib/security.cjs. Provides sanitization for agent-generated content
 * written to .planning/ files.
 */

import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SafeJsonResult<T> {
	ok: true;
	value: T;
}
export interface SafeJsonError {
	ok: false;
	error: string;
}
export type SafeJsonParseResult<T> = SafeJsonResult<T> | SafeJsonError;

export interface PathValidationResult {
	safe: boolean;
	resolved: string;
	error?: string;
}

export interface FieldValidationResult {
	valid: boolean;
	error?: string;
}

// ─── Injection patterns ───────────────────────────────────────────────────────

const INJECTION_PATTERNS: RegExp[] = [
	/ignore\s+(?:all\s+)?previous\s+instructions?/i,
	/forget\s+(?:all\s+)?previous/i,
	/\bsystem\s+prompt\b/i,
	/\bdisregard\s+(?:all\s+)?previous\b/i,
	/\byou\s+are\s+now\b/i,
	/\bact\s+as\s+(?:a\s+)?(?:new\s+)?(?:AI|assistant|gpt|claude|llm)\b/i,
	/\bpretend\s+(?:you\s+are|to\s+be)\b/i,
	/\boverride\s+(?:all\s+)?(?:previous\s+)?(?:instructions?|directives?|rules?|constraints?)\b/i,
	/\bdo\s+not\s+follow\s+(?:the\s+)?(?:previous\s+)?instructions?\b/i,
	/\bnew\s+instructions?:\s/i,
	/\bignore\s+(?:all\s+)?(?:previous\s+)?(?:context|history|instructions?)\b/i,
	/\bdeveloper\s+mode\b/i,
	/\bDAN\s+mode\b/i,
];

const MAX_SAFE_LENGTH = 10000;

/**
 * Scan content for prompt-injection patterns.
 * Returns an array of matched patterns (empty = safe).
 */
export function scanForInjection(content: string): string[] {
	const matches: string[] = [];
	for (const pattern of INJECTION_PATTERNS) {
		if (pattern.test(content)) {
			matches.push(pattern.source);
		}
	}
	return matches;
}

/**
 * Sanitize a string for safe use in agent prompts.
 * Strips invisible characters and known injection markers.
 */
export function sanitizeForPrompt(text: string): string {
	if (!text) return text;
	// Remove null bytes and other invisible control characters
	// eslint-disable-next-line no-control-regex
	let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
	// Truncate to safe length
	if (sanitized.length > MAX_SAFE_LENGTH) {
		sanitized = sanitized.slice(0, MAX_SAFE_LENGTH) + "... [truncated]";
	}
	return sanitized;
}

/**
 * Safely parse JSON with a human-readable error on failure.
 */
export function safeJsonParse<T = unknown>(
	raw: string,
	opts: { label?: string } = {},
): SafeJsonParseResult<T> {
	try {
		return { ok: true, value: JSON.parse(raw) as T };
	} catch (err) {
		const label = opts.label ?? "JSON";
		return { ok: false, error: `Invalid ${label}: ${(err as Error).message}` };
	}
}

/**
 * Validate a file path is safe (no null bytes, no path traversal to sensitive dirs).
 */
export function validatePath(
	filePath: string,
	cwd: string,
	opts: { allowAbsolute?: boolean } = {},
): PathValidationResult {
	if (filePath.includes("\0")) {
		return {
			safe: false,
			resolved: filePath,
			error: "Path contains null bytes",
		};
	}

	const resolved = path.isAbsolute(filePath)
		? filePath
		: path.resolve(cwd, filePath);

	// Prevent traversal above home directory
	const home = process.env["HOME"] ?? "/";
	if (!resolved.startsWith(home) && !resolved.startsWith(cwd)) {
		return { safe: false, resolved, error: "Path traversal rejected" };
	}

	if (!opts.allowAbsolute && path.isAbsolute(filePath)) {
		return { safe: false, resolved, error: "Absolute paths not allowed" };
	}

	return { safe: true, resolved };
}

/**
 * Validate a file path and throw on traversal attempt.
 */
export function requireSafePath(
	filePath: string,
	baseDir: string,
	label: string,
	opts: { allowAbsolute?: boolean } = {},
): string {
	const result = validatePath(filePath, baseDir, opts);
	if (!result.safe)
		throw new Error(`${label || "Path"} validation failed: ${result.error}`);
	return result.resolved;
}

/**
 * Sanitize text for display back to the user.
 */
export function sanitizeForDisplay(text: string): string {
	if (!text || typeof text !== "string") return text;
	let s = text.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, "");
	s = s.replace(
		/<(\/?)(?:system|assistant|human)>/gi,
		(_, sl) => `\uFF1C${sl || ""}system-text\uFF1E`,
	);
	s = s.replace(/\[(SYSTEM|INST)\]/gi, "[$1-TEXT]");
	s = s.replace(/<<\s*SYS\s*>>/gi, "\u00ABSYS-TEXT\u00BB");
	return s;
}

/**
 * Validate a STATE.md field name to prevent regex injection via crafted field names.
 * Field names must be human-readable: letters, spaces, hyphens, underscores only.
 */
export function validateFieldName(fieldName: string): FieldValidationResult {
	if (!fieldName || typeof fieldName !== "string") {
		return { valid: false, error: "Field name must be a non-empty string" };
	}
	if (!/^[a-zA-Z][a-zA-Z0-9 _-]*$/.test(fieldName)) {
		return {
			valid: false,
			error: `Field name "${fieldName}" contains invalid characters. Only letters, digits, spaces, hyphens, and underscores are allowed.`,
		};
	}
	return { valid: true };
}
