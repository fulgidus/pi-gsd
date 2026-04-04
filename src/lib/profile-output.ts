/**
 * profile-output.ts - Profile markdown generation (CLAUDE.md, dev preferences, questionnaire).
 *
 * Ported signatures from lib/profile-output.cjs.
 */

import fs from "fs";
import path from "path";
import { gsdError, output, toPosixPath } from "./core.js";

interface WriteProfileOptions {
    input: string;
    output?: string | null;
}
interface QuestionnaireOptions {
    answers?: string | null;
}
interface DevPreferencesOptions {
    analysis?: string | null;
    output?: string | null;
    stack?: string | null;
}
interface ClaudeProfileOptions {
    analysis?: string | null;
    output?: string | null;
    global?: boolean;
}
interface ClaudeMdOptions {
    output?: string | null;
    auto?: boolean;
    force?: boolean;
    /** When 'pi', generates AGENTS.md instead of CLAUDE.md */
    harness?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveProfileOutput(
    cwd: string,
    outputOverride?: string | null,
    defaultName = "CLAUDE.md",
): string {
    if (outputOverride) return path.resolve(outputOverride);
    return path.join(cwd, defaultName);
}

function loadAnalysis(
    analysisPath: string | null | undefined,
    cwd: string,
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- analysis JSON blob; tracked in TODO #6
): any {
    if (!analysisPath) return null;
    const fullPath = path.isAbsolute(analysisPath)
        ? analysisPath
        : path.join(cwd, analysisPath);
    if (!fs.existsSync(fullPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    } catch {
        return null;
    }
}

function formatMarkdown(
    sections: Array<{ heading: string; body: string }>,
): string {
    return (
        sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n") + "\n"
    );
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function cmdWriteProfile(
    cwd: string,
    options: WriteProfileOptions,
    raw: boolean,
): void {
    if (!options.input) gsdError("--input <analysis-json-path> is required");
    const analysis = loadAnalysis(options.input, cwd);
    if (!analysis) {
        output(
            { error: "Could not load analysis file", input: options.input },
            raw,
        );
        return;
    }
    const outPath = resolveProfileOutput(cwd, options.output);
    const sections = [];
    if (analysis.preferences)
        sections.push({
            heading: "Development Preferences",
            body: analysis.preferences,
        });
    if (analysis.patterns)
        sections.push({ heading: "Patterns Observed", body: analysis.patterns });
    if (analysis.style)
        sections.push({ heading: "Code Style", body: analysis.style });
    const content =
        sections.length > 0
            ? formatMarkdown(sections)
            : JSON.stringify(analysis, null, 2) + "\n";
    fs.writeFileSync(outPath, content, "utf-8");
    output(
        { written: true, path: toPosixPath(path.relative(cwd, outPath)) },
        raw,
        outPath,
    );
}

export function cmdProfileQuestionnaire(
    options: QuestionnaireOptions,
    raw: boolean,
): void {
    const questions = [
        {
            id: "style",
            question: "Preferred code style (functional/OOP/mixed)?",
            default: "mixed",
        },
        {
            id: "testing",
            question: "Testing framework preference?",
            default: "vitest/jest",
        },
        {
            id: "comments",
            question: "Comment verbosity (minimal/moderate/verbose)?",
            default: "moderate",
        },
        {
            id: "error_handling",
            question: "Error handling preference (try/catch/result-type)?",
            default: "try/catch",
        },
    ];
    if (options.answers) {
        try {
            const answers = JSON.parse(options.answers);
            output({ questionnaire: questions, answers, complete: true }, raw);
        } catch {
            output({ questionnaire: questions, answers: null, complete: false }, raw);
        }
    } else {
        output(
            {
                questionnaire: questions,
                instructions:
                    'Re-run with --answers \'{"style":"...","testing":"..."}\' to record preferences',
            },
            raw,
        );
    }
}

export function cmdGenerateDevPreferences(
    cwd: string,
    options: DevPreferencesOptions,
    raw: boolean,
): void {
    const analysis = loadAnalysis(options.analysis, cwd);
    const outPath = resolveProfileOutput(
        cwd,
        options.output,
        ".dev-preferences.md",
    );
    const stack = options.stack ? `\n\n## Stack\n\n${options.stack}` : "";
    const body = analysis
        ? `# Developer Preferences\n\n*Generated from session analysis*${stack}\n\n${JSON.stringify(analysis, null, 2)}\n`
        : `# Developer Preferences\n\n*No analysis provided - edit manually.*${stack}\n`;
    fs.writeFileSync(outPath, body, "utf-8");
    output(
        { written: true, path: toPosixPath(path.relative(cwd, outPath)) },
        raw,
        outPath,
    );
}

export function cmdGenerateClaudeProfile(
    cwd: string,
    options: ClaudeProfileOptions,
    raw: boolean,
): void {
    const analysis = loadAnalysis(options.analysis, cwd);
    const outPath = options.global
        ? path.join(process.env["HOME"] ?? "", ".claude", "CLAUDE.md")
        : resolveProfileOutput(cwd, options.output, "CLAUDE.md");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const body = analysis
        ? `# Claude Profile\n\n*Generated from session analysis*\n\n${JSON.stringify(analysis, null, 2)}\n`
        : `# Claude Profile\n\n*No analysis provided - edit manually.*\n`;
    fs.writeFileSync(outPath, body, "utf-8");
    output(
        {
            written: true,
            path: options.global ? outPath : toPosixPath(path.relative(cwd, outPath)),
        },
        raw,
        outPath,
    );
}

export function cmdGenerateClaudeMd(
    cwd: string,
    options: ClaudeMdOptions,
    raw: boolean,
): void {
    const defaultName = options.harness === "pi" ? "AGENTS.md" : "CLAUDE.md";
    const outPath = resolveProfileOutput(cwd, options.output, defaultName);
    if (fs.existsSync(outPath) && !options.force && !options.auto) {
        output(
            {
                written: false,
                reason: "File already exists. Use --force to overwrite.",
                path: toPosixPath(path.relative(cwd, outPath)),
            },
            raw,
            "exists",
        );
        return;
    }
    const heading = options.harness === "pi" ? "AGENTS.md" : "CLAUDE.md";
    const body = `# ${heading}\n\n*Agent profile for this project.*\n\n## Quick Start\n\nSee \`.planning/PROJECT.md\` for project overview.\n\n## GSD Integration\n\nThis project uses GSD (Get Shit Done) for structured development. Run \`/gsd-help\` to see available commands.\n`;
    fs.writeFileSync(outPath, body, "utf-8");
    output(
        { written: true, path: toPosixPath(path.relative(cwd, outPath)) },
        raw,
        outPath,
    );
}
