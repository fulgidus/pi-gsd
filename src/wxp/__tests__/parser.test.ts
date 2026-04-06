import { describe, it, expect } from "vitest";
import { extractWxpTags, extractCodeFenceRegions } from "../parser.js";
import { buildOperation } from "../ast.js";

describe("extractCodeFenceRegions", () => {
  it("returns empty for content with no fences", () => {
    expect(extractCodeFenceRegions("hello world")).toEqual([]);
  });

  it("identifies a fenced region", () => {
    const content = "before\n```\ncode\n```\nafter";
    const regions = extractCodeFenceRegions(content);
    expect(regions).toHaveLength(1);
    expect(content.slice(regions[0][0], regions[0][1])).toContain("code");
  });
});

describe("extractWxpTags — code-fence skip (WXP-01)", () => {
  it("does NOT parse <gsd-paste> inside a code fence", () => {
    const content = "before\n```\n<gsd-paste name=\"x\" />\n```\nafter";
    const tags = extractWxpTags(content);
    const pastes = tags.filter((t) => t.node.tag === "gsd-paste");
    expect(pastes).toHaveLength(0);
  });

  it("DOES parse <gsd-paste> outside a code fence", () => {
    const content = 'text\n<gsd-paste name="x" />\nmore';
    const tags = extractWxpTags(content);
    const pastes = tags.filter((t) => t.node.tag === "gsd-paste");
    expect(pastes).toHaveLength(1);
    expect(pastes[0].node.attrs["name"]).toBe("x");
  });
});

describe("extractWxpTags — gsd-execute", () => {
  it("extracts a gsd-execute block with shell children", () => {
    const content = [
      "<gsd-execute>",
      "  <shell command=\"pi-gsd-tools\">",
      "    <args><arg string=\"init\" /><arg string=\"execute-phase\" /><arg name=\"phase\" wrap='\"' /></args>",
      "    <outs><out type=\"string\" name=\"init\" /></outs>",
      "  </shell>",
      "</gsd-execute>",
    ].join("\n");

    const tags = extractWxpTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].node.tag).toBe("gsd-execute");

    const ops = tags[0].node.children.flatMap(buildOperation);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("shell");
    if (ops[0].type === "shell") {
      expect(ops[0].command).toBe("pi-gsd-tools");
      expect(ops[0].args).toHaveLength(3);
      expect(ops[0].outs).toHaveLength(1);
      expect(ops[0].outs[0].name).toBe("init");
    }
  });
});

describe("extractWxpTags — gsd-arguments", () => {
  it("parses typed positionals and flag", () => {
    const content = [
      "<gsd-arguments>",
      "  <settings><keep-extra-args /></settings>",
      "  <arg name=\"phase\" type=\"number\" />",
      "  <arg name=\"auto\" type=\"flag\" flag=\"--auto\" optional />",
      "  <arg name=\"user-text\" type=\"string\" optional />",
      "</gsd-arguments>",
    ].join("\n");

    const tags = extractWxpTags(content);
    const ops = tags[0].node.children.length > 0
      ? tags.flatMap((t) => buildOperation(t.node))
      : buildOperation(tags[0].node);
    const argsOp = ops.find((o) => o.type === "arguments");
    expect(argsOp).toBeDefined();
    if (argsOp?.type === "arguments") {
      expect(argsOp.args).toHaveLength(3);
      expect(argsOp.settings.keepExtraArgs).toBe(true);
      const flag = argsOp.args.find((a) => a.type === "flag");
      expect(flag?.flag).toBe("--auto");
      expect(flag?.optional).toBe(true);
    }
  });
});

describe("extractWxpTags — gsd-include", () => {
  it("parses self-closing include", () => {
    const content = `<gsd-include path="other.md" />`;
    const tags = extractWxpTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].node.attrs["path"]).toBe("other.md");
  });

  it("parses include with include-arguments", () => {
    const content = `<gsd-include path="other.md" include-arguments />`;
    const tags = extractWxpTags(content);
    expect("include-arguments" in tags[0].node.attrs).toBe(true);
  });

  it("parses include with arg mappings (INC-02)", () => {
    const content = [
      `<gsd-include path="other.md">`,
      `  <gsd-arguments>`,
      `    <arg name="my-phase" as="phase" />`,
      `  </gsd-arguments>`,
      `</gsd-include>`,
    ].join("\n");
    const tags = extractWxpTags(content);
    const ops = buildOperation(tags[0].node);
    if (ops[0].type === "include") {
      expect(ops[0].argMappings).toHaveLength(1);
      expect(ops[0].argMappings[0].name).toBe("my-phase");
      expect(ops[0].argMappings[0].as).toBe("phase");
    }
  });
});

describe("extractWxpTags — gsd-version", () => {
  it("parses version tag", () => {
    const content = `<gsd-version v="1.12.4" />`;
    const tags = extractWxpTags(content);
    expect(tags[0].node.attrs["v"]).toBe("1.12.4");
  });

  it("parses do-not-update flag", () => {
    const content = `<gsd-version v="1.0.0" do-not-update />`;
    const tags = extractWxpTags(content);
    expect("do-not-update" in tags[0].node.attrs).toBe(true);
  });
});

describe("buildOperation — if node with PRD condition structure", () => {
  it("builds an if/condition/equals/left/right node", () => {
    const content = [
      "<gsd-execute>",
      "  <if>",
      "    <condition>",
      "      <equals>",
      "        <left name=\"auto-chain-active\" />",
      "        <right type=\"boolean\" value=\"false\" />",
      "      </equals>",
      "    </condition>",
      "    <then>",
      "      <shell command=\"pi-gsd-tools\">",
      "        <args><arg string=\"config-set\" /></args>",
      "        <outs><suppress-errors /></outs>",
      "      </shell>",
      "    </then>",
      "  </if>",
      "</gsd-execute>",
    ].join("\n");

    const tags = extractWxpTags(content);
    const ops = buildOperation(tags[0].node);
    expect(ops[0].type).toBe("execute");
    if (ops[0].type === "execute") {
      const ifOp = ops[0].children[0];
      expect(ifOp.type).toBe("if");
      if (ifOp.type === "if") {
        expect(ifOp.condition.op).toBe("equals");
        expect((ifOp.condition as { left: { name: string } }).left.name).toBe("auto-chain-active");
        expect((ifOp.condition as { right: { type: string } }).right.type).toBe("boolean");
        expect((ifOp.condition as { right: { value: string } }).right.value).toBe("false");
        expect(ifOp.then).toHaveLength(1);
        expect(ifOp.then[0].type).toBe("shell");
        if (ifOp.then[0].type === "shell") {
          expect(ifOp.then[0].suppressErrors).toBe(true);
        }
      }
    }
  });
});
