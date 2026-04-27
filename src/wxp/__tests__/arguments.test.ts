import { describe, it, expect } from "vitest";
import { parseArguments, WxpArgumentsError } from "../arguments.js";
import { createVariableStore } from "../variables.js";
import { x } from "./helpers.js";

// Build a <gsd-arguments> XmlNode from a declarative spec
function argsNode(opts: {
    keep?: boolean;
    strict?: boolean;
    args: Array<{ name: string; type: string; flag?: string; optional?: boolean }>;
}) {
    const settingsChildren = [];
    if (opts.keep) settingsChildren.push(x("keep-extra-args"));
    if (opts.strict) settingsChildren.push(x("strict-args"));

    const argNodes = opts.args.map((a) => {
        const attrs: Record<string, string> = { name: a.name, type: a.type };
        if (a.flag) attrs["flag"] = a.flag;
        if (a.optional) attrs["optional"] = "";
        return x("arg", attrs);
    });

    return x("gsd-arguments", {}, [
        x("settings", {}, settingsChildren),
        ...argNodes,
    ]);
}

describe("parseArguments - two-pass (PRD §3.2)", () => {
    it("extracts flag and assigns positional", () => {
        const vars = createVariableStore();
        parseArguments(argsNode({
            args: [
                { name: "phase", type: "number" },
                { name: "auto-chain-active", type: "flag", flag: "--auto", optional: true },
            ],
        }), "1 --auto", vars);
        expect(vars.get("phase")).toBe("1");
        expect(vars.get("auto-chain-active")).toBe("true");
    });

    it("absent flag defaults to false", () => {
        const vars = createVariableStore();
        parseArguments(argsNode({
            args: [{ name: "dry-run", type: "flag", flag: "--dry-run", optional: true }],
        }), "", vars);
        expect(vars.get("dry-run")).toBe("false");
    });

    it("greedy last string consumes all remaining tokens", () => {
        const vars = createVariableStore();
        parseArguments(argsNode({
            args: [
                { name: "phase", type: "number" },
                { name: "auto", type: "flag", flag: "--auto", optional: true },
                { name: "user-text", type: "string", optional: true },
            ],
        }), "1 --auto fix the login bug", vars);
        expect(vars.get("phase")).toBe("1");
        expect(vars.get("auto")).toBe("true");
        expect(vars.get("user-text")).toBe("fix the login bug");
    });

    it("throws on missing required positional", () => {
        const vars = createVariableStore();
        expect(() => parseArguments(argsNode({
            args: [{ name: "phase", type: "number" }],
        }), "", vars)).toThrow(WxpArgumentsError);
    });

    it("number type: throws on NaN", () => {
        const vars = createVariableStore();
        expect(() => parseArguments(argsNode({
            args: [{ name: "phase", type: "number" }],
        }), "notanumber", vars)).toThrow(WxpArgumentsError);
    });

    it("keep-extra-args stores extra in _extra", () => {
        const vars = createVariableStore();
        parseArguments(argsNode({
            keep: true,
            args: [{ name: "phase", type: "number" }],
        }), "1 extra stuff", vars);
        expect(vars.get("_extra")).toBe("extra stuff");
    });
});

describe("named value flags - Pass 1.5 (--flag value)", () => {
    it("--wave 2 with a phase positional: wave gets 2, phase gets its value", () => {
        const vars = createVariableStore();
        parseArguments(argsNode({
            args: [
                { name: "phase", type: "number" },
                { name: "wave", type: "number", flag: "--wave", optional: true },
            ],
        }), "--wave 2 1", vars);
        expect(vars.get("wave")).toBe("2");
        expect(vars.get("phase")).toBe("1");
    });

    it("--wave absent and optional: sets empty string, positional still works", () => {
        const vars = createVariableStore();
        parseArguments(argsNode({
            args: [
                { name: "phase", type: "number" },
                { name: "wave", type: "number", flag: "--wave", optional: true },
            ],
        }), "3", vars);
        expect(vars.get("wave")).toBe("");
        expect(vars.get("phase")).toBe("3");
    });

    it("--wave notanumber: throws WxpArgumentsError", () => {
        const vars = createVariableStore();
        expect(() => parseArguments(argsNode({
            args: [
                { name: "wave", type: "number", flag: "--wave", optional: true },
            ],
        }), "--wave notanumber", vars)).toThrow(WxpArgumentsError);
    });

    it("--wave present but no following value: throws WxpArgumentsError", () => {
        const vars = createVariableStore();
        expect(() => parseArguments(argsNode({
            args: [
                { name: "wave", type: "number", flag: "--wave", optional: true },
            ],
        }), "--wave", vars)).toThrow(WxpArgumentsError);
    });

    it("mixed: '02 --auto --wave 3 fix the bug' with all arg types parsed correctly", () => {
        const vars = createVariableStore();
        parseArguments(argsNode({
            args: [
                { name: "phase", type: "number" },
                { name: "auto-chain-active", type: "flag", flag: "--auto", optional: true },
                { name: "wave", type: "number", flag: "--wave", optional: true },
                { name: "user-text", type: "string", optional: true },
            ],
        }), "02 --auto --wave 3 fix the bug", vars);
        expect(vars.get("phase")).toBe("2");
        expect(vars.get("auto-chain-active")).toBe("true");
        expect(vars.get("wave")).toBe("3");
        expect(vars.get("user-text")).toBe("fix the bug");
    });
});
