/**
 * uat.ts - UAT Audit cross-phase scanner + checkpoint renderer.
 */

import fs from "fs";
import path from "path";
import {
    getMilestonePhaseFilter,
    gsdError,
    output,
    planningDir,
    toPosixPath,
} from "./core.js";
import { extractFrontmatter } from "./frontmatter.js";
import { requireSafePath, sanitizeForDisplay } from "./security.js";

// ─── Item type ────────────────────────────────────────────────────────────────

interface UatItem {
    test?: number;
    name: string;
    expected?: string;
    result: string;
    category: string;
    reason?: string;
    blocked_by?: string;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function cmdAuditUat(cwd: string, raw: boolean): void {
    const phasesDir = path.join(planningDir(cwd), "phases");
    if (!fs.existsSync(phasesDir))
        gsdError("No phases directory found in planning directory");
    const isDirInMilestone = getMilestonePhaseFilter(cwd);
    const results: unknown[] = [];
    const dirs = fs
        .readdirSync(phasesDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter(isDirInMilestone)
        .sort();
    for (const dir of dirs) {
        const phaseMatch = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
        const phaseNum = phaseMatch ? phaseMatch[1] : dir;
        const phaseDir = path.join(phasesDir, dir);
        const files = fs.readdirSync(phaseDir);
        for (const file of files.filter(
            (f) => f.includes("-UAT") && f.endsWith(".md"),
        )) {
            const content = fs.readFileSync(path.join(phaseDir, file), "utf-8");
            const items = parseUatItems(content);
            if (items.length > 0)
                results.push({
                    phase: phaseNum,
                    phase_dir: dir,
                    file,
                    file_path: toPosixPath(path.relative(cwd, path.join(phaseDir, file))),
                    type: "uat",
                    status: extractFrontmatter(content).status || "unknown",
                    items,
                });
        }
        for (const file of files.filter(
            (f) => f.includes("-VERIFICATION") && f.endsWith(".md"),
        )) {
            const content = fs.readFileSync(path.join(phaseDir, file), "utf-8");
            const status =
                (extractFrontmatter(content).status as string) || "unknown";
            if (status === "human_needed" || status === "gaps_found") {
                const items = parseVerificationItems(content, status);
                if (items.length > 0)
                    results.push({
                        phase: phaseNum,
                        phase_dir: dir,
                        file,
                        file_path: toPosixPath(
                            path.relative(cwd, path.join(phaseDir, file)),
                        ),
                        type: "verification",
                        status,
                        items,
                    });
            }
        }
    }
    const summary: {
        total_files: number;
        total_items: number;
        by_category: Record<string, number>;
        by_phase: Record<string, number>;
    } = {
        total_files: results.length,
        total_items: (results as { items: unknown[] }[]).reduce(
            (s, r) => s + r.items.length,
            0,
        ),
        by_category: {},
        by_phase: {},
    };
    for (const r of results as { phase: string; items: UatItem[] }[]) {
        if (!summary.by_phase[r.phase]) summary.by_phase[r.phase] = 0;
        for (const item of r.items) {
            summary.by_phase[r.phase]++;
            summary.by_category[item.category] =
                (summary.by_category[item.category] || 0) + 1;
        }
    }
    output({ results, summary }, raw);
}

export function cmdRenderCheckpoint(
    cwd: string,
    options: { file?: string | null },
    raw: boolean,
): void {
    const filePath = options.file;
    if (!filePath)
        gsdError("UAT file required: use uat render-checkpoint --file <path>");
    const resolvedPath = requireSafePath(filePath!, cwd, "UAT file", {
        allowAbsolute: true,
    });
    if (!fs.existsSync(resolvedPath)) gsdError(`UAT file not found: ${filePath}`);
    const content = fs.readFileSync(resolvedPath, "utf-8");
    const currentTest = parseCurrentTest(content);
    if (currentTest.complete)
        gsdError(
            "UAT session is already complete; no pending checkpoint to render",
        );
    const checkpoint = buildCheckpoint(currentTest);
    output(
        {
            file_path: toPosixPath(path.relative(cwd, resolvedPath)),
            test_number: currentTest.number,
            test_name: currentTest.name,
            checkpoint,
        },
        raw,
        checkpoint,
    );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface CurrentTest { complete: boolean; number?: number; name?: string; expected?: string; }

export function parseCurrentTest(content: string): CurrentTest {
    const currentTestMatch = content.match(
        /##\s*Current Test\s*(?:\n<!--[\s\S]*?-->)?\n([\s\S]*?)(?=\n##\s|$)/i,
    );
    if (!currentTestMatch) gsdError("UAT file is missing a Current Test section");
    const section = currentTestMatch![1].trimEnd();
    if (!section.trim()) gsdError("Current Test section is empty");
    if (/\[testing complete\]/i.test(section)) return { complete: true };
    const numberMatch = section.match(/^number:\s*(\d+)\s*$/m);
    const nameMatch = section.match(/^name:\s*(.+)\s*$/m);
    const expectedBlockMatch =
        section.match(/^expected:\s*\|\n([\s\S]*?)(?=^\w[\w-]*:\s)/m) ||
        section.match(/^expected:\s*\|\n([\s\S]+)/m);
    const expectedInlineMatch = section.match(/^expected:\s*(.+)\s*$/m);
    if (
        !numberMatch ||
        !nameMatch ||
        (!expectedBlockMatch && !expectedInlineMatch)
    )
        gsdError("Current Test section is malformed");
    let expected: string;
    if (expectedBlockMatch)
        expected = expectedBlockMatch[1]
            .split("\n")
            .map((l) => l.replace(/^ {2}/, ""))
            .join("\n")
            .trim();
    else expected = expectedInlineMatch![1].trim();
    return {
        complete: false,
        number: parseInt(numberMatch![1], 10),
        name: sanitizeForDisplay(nameMatch![1].trim()),
        expected: sanitizeForDisplay(expected),
    };
}

export function buildCheckpoint(currentTest: CurrentTest): string {
    return [
        "╔══════════════════════════════════════════════════════════════╗",
        "║  CHECKPOINT: Verification Required                           ║",
        "╚══════════════════════════════════════════════════════════════╝",
        "",
        `**Test ${currentTest.number}: ${currentTest.name}**`,
        "",
        currentTest.expected,
        "",
        "──────────────────────────────────────────────────────────────",
        "Type `pass` or describe what's wrong.",
        "──────────────────────────────────────────────────────────────",
    ].join("\n");
}

function parseUatItems(content: string): UatItem[] {
    const items: UatItem[] = [];
    const testPattern =
        /###\s*(\d+)\.\s*([^\n]+)\nexpected:\s*([^\n]+)\nresult:\s*(\w+)(?:\n(?:reported|reason|blocked_by):\s*[^\n]*)?/g;
    let match: RegExpExecArray | null;
    while ((match = testPattern.exec(content)) !== null) {
        const [, num, name, expected, result] = match;
        if (result === "pending" || result === "skipped" || result === "blocked") {
            const afterMatch = content.slice(match.index);
            const nextHeading = afterMatch.indexOf("\n###", 1);
            const blockText =
                nextHeading > 0 ? afterMatch.slice(0, nextHeading) : afterMatch;
            const reasonMatch = blockText.match(/reason:\s*(.+)/);
            const blockedByMatch = blockText.match(/blocked_by:\s*(.+)/);
            const item: UatItem = {
                test: parseInt(num, 10),
                name: name.trim(),
                expected: expected.trim(),
                result,
                category: categorizeItem(result, reasonMatch?.[1], blockedByMatch?.[1]),
            };
            if (reasonMatch) item.reason = reasonMatch[1].trim();
            if (blockedByMatch) item.blocked_by = blockedByMatch[1].trim();
            items.push(item);
        }
    }
    return items;
}

function parseVerificationItems(content: string, status: string): UatItem[] {
    const items: UatItem[] = [];
    if (status === "human_needed") {
        const hvSection = content.match(
            /##\s*Human Verification.*?\n([\s\S]*?)(?=\n##\s|\n---\s|$)/i,
        );
        if (hvSection) {
            for (const line of hvSection[1].split("\n")) {
                const tableMatch = line.match(/\|\s*(\d+)\s*\|\s*([^|]+)/);
                const bulletMatch = line.match(/^[-*]\s+(.+)/);
                const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
                if (tableMatch)
                    items.push({
                        test: parseInt(tableMatch[1], 10),
                        name: tableMatch[2].trim(),
                        result: "human_needed",
                        category: "human_uat",
                    });
                else if (numberedMatch)
                    items.push({
                        test: parseInt(numberedMatch[1], 10),
                        name: numberedMatch[2].trim(),
                        result: "human_needed",
                        category: "human_uat",
                    });
                else if (bulletMatch && bulletMatch[1].length > 10)
                    items.push({
                        name: bulletMatch[1].trim(),
                        result: "human_needed",
                        category: "human_uat",
                    });
            }
        }
    }
    return items;
}

function categorizeItem(
    result: string,
    reason?: string,
    blockedBy?: string,
): string {
    if (result === "blocked" || blockedBy) {
        if (blockedBy) {
            if (/server/i.test(blockedBy)) return "server_blocked";
            if (/device|physical/i.test(blockedBy)) return "device_needed";
            if (/build|release|preview/i.test(blockedBy)) return "build_needed";
            if (/third.party|twilio|stripe/i.test(blockedBy)) return "third_party";
        }
        return "blocked";
    }
    if (result === "skipped" && reason) {
        if (/server|not running|not available/i.test(reason))
            return "server_blocked";
        if (/simulator|physical|device/i.test(reason)) return "device_needed";
        if (/build|release|preview/i.test(reason)) return "build_needed";
        return "skipped_unresolved";
    }
    if (result === "pending") return "pending";
    if (result === "human_needed") return "human_uat";
    return "unknown";
}
