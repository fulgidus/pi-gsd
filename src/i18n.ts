import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Params = Record<string, string | number>;
type Translate = (key: string, fallback: string, params?: Params) => string;

let translate: Translate = (_key, fallback, params) => format(fallback, params);

function format(text: string, params?: Params): string {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (_match, key: string) => String(params[key] ?? `{${key}}`));
}

export function t(key: string, fallback: string, params?: Params): string {
    return translate(key, fallback, params);
}

const bundles = [
    {
        locale: "ja",
        namespace: "pi-gsd",
        messages: {
            "cmd.progress": "プロジェクト進捗と次の手順を表示します（即時）",
            "cmd.stats": "プロジェクト統計を表示します（即時）",
            "cmd.health": ".planning/ の整合性を確認します（即時）",
            "cmd.health.repair": "--repair  問題を自動修正",
            "cmd.next": "次の GSD アクションへ自動で進みます（即時、LLMなし）",
            "cmd.help": "すべての GSD コマンドを一覧表示します（即時）",
            "next.noProject": "❌ GSD プロジェクトが見つかりません。/gsd-new-project を実行して初期化してください。",
            "next.allComplete": "✅  すべての phase が完了しました!",
            "next.noPlans": "Phase {phase} にはまだ plan がありません - discussion から始めてください",
            "next.execute": "Phase {phase}: {summaries}/{plans} plan 完了 - execution を続けてください",
            "next.verify": "Phase {phase}: すべての plan が完了 - UAT を verify してください",
            "next.morePending": "    (この後にさらに {count} phase が pending)",
            "context.criticalGsd": "🔴 CONTEXT CRITICAL: {used}% used ({remaining}% left). GSD state is in STATE.md. Inform user to run /gsd-pause-work.",
            "context.critical": "🔴 CONTEXT CRITICAL: {used}% used ({remaining}% left). Inform user context is nearly exhausted.",
            "context.warningGsd": "⚠️ CONTEXT WARNING: {used}% used ({remaining}% left). Avoid starting new complex work.",
            "context.warning": "⚠️ CONTEXT WARNING: {used}% used ({remaining}% left). Context is getting limited.",
        },
    },
    {
        locale: "zh-TW",
        namespace: "pi-gsd",
        messages: {
            "cmd.progress": "顯示專案進度與下一步（即時）",
            "cmd.stats": "顯示專案統計（即時）",
            "cmd.health": "檢查 .planning/ 完整性（即時）",
            "cmd.health.repair": "--repair  自動修正問題",
            "cmd.next": "自動前進到下一個 GSD 動作（即時，不使用 LLM）",
            "cmd.help": "列出所有 GSD 指令（即時）",
            "next.noProject": "❌ 找不到 GSD 專案。請執行 /gsd-new-project 初始化。",
            "next.allComplete": "✅  所有 phase 都已完成!",
            "next.noPlans": "Phase {phase} 尚無 plan - 請從 discussion 開始",
            "next.execute": "Phase {phase}: {summaries}/{plans} 個 plan 已完成 - 繼續 execution",
            "next.verify": "Phase {phase}: 所有 plan 已完成 - verify UAT",
            "next.morePending": "    (後面還有 {count} 個 phase pending)",
            "context.criticalGsd": "🔴 CONTEXT CRITICAL: 已使用 {used}%（剩餘 {remaining}%）。GSD state 在 STATE.md。請告知使用者執行 /gsd-pause-work。",
            "context.critical": "🔴 CONTEXT CRITICAL: 已使用 {used}%（剩餘 {remaining}%）。請告知使用者 context 快用完了。",
            "context.warningGsd": "⚠️ CONTEXT WARNING: 已使用 {used}%（剩餘 {remaining}%）。避免開始新的複雜工作。",
            "context.warning": "⚠️ CONTEXT WARNING: 已使用 {used}%（剩餘 {remaining}%）。Context 已經有限。",
        },
    },
    {
        locale: "de",
        namespace: "pi-gsd",
        messages: {
            "cmd.progress": "Projektfortschritt mit nächsten Schritten anzeigen (sofort)",
            "cmd.stats": "Projektstatistiken anzeigen (sofort)",
            "cmd.health": ".planning/-Integrität prüfen (sofort)",
            "cmd.health.repair": "--repair  Probleme automatisch beheben",
            "cmd.next": "Automatisch zur nächsten GSD-Aktion wechseln (sofort, kein LLM)",
            "cmd.help": "Alle GSD-Befehle auflisten (sofort)",
            "next.noProject": "❌ Kein GSD-Projekt gefunden. /gsd-new-project ausführen, um zu initialisieren.",
            "next.allComplete": "✅  Alle Phasen abgeschlossen!",
            "next.noPlans": "Phase {phase} hat noch keine Pläne - mit Discussion starten",
            "next.execute": "Phase {phase}: {summaries}/{plans} Pläne erledigt - Execution fortsetzen",
            "next.verify": "Phase {phase}: alle Pläne erledigt - UAT verifizieren",
            "next.morePending": "    ({count} weitere Phase(n) danach ausstehend)",
            "context.criticalGsd": "🔴 CONTEXT CRITICAL: {used}% used ({remaining}% left). GSD state is in STATE.md. Inform user to run /gsd-pause-work.",
            "context.critical": "🔴 CONTEXT CRITICAL: {used}% used ({remaining}% left). Inform user context is nearly exhausted.",
            "context.warningGsd": "⚠️ CONTEXT WARNING: {used}% used ({remaining}% left). Avoid starting new complex work.",
            "context.warning": "⚠️ CONTEXT WARNING: {used}% used ({remaining}% left). Context is getting limited.",
        },
    },
];

export function initI18n(pi: ExtensionAPI): void {
    const events = pi.events;
    if (!events) return;
    for (const bundle of bundles) events.emit("pi-core/i18n/registerBundle", bundle);
    events.emit("pi-core/i18n/requestApi", {
        namespace: "pi-gsd",
        callback(api: { t?: Translate } | undefined) {
            if (typeof api?.t === "function") translate = api.t;
        },
    });
}
