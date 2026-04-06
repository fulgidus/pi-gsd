"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// .gsd/extensions/pi-gsd-hooks.ts
var pi_gsd_hooks_exports = {};
__export(pi_gsd_hooks_exports, {
  default: () => pi_gsd_hooks_default
});
module.exports = __toCommonJS(pi_gsd_hooks_exports);
var import_node_child_process2 = require("child_process");
var import_node_fs3 = require("fs");
var import_node_os = require("os");
var import_node_path4 = require("path");

// src/wxp/index.ts
var import_node_fs2 = __toESM(require("fs"));
var import_node_path3 = __toESM(require("path"));

// src/wxp/parser.ts
function extractCodeFenceRegions(content) {
  const regions = [];
  const re = /^```[^\n]*\n[\s\S]*?^```/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    regions.push([m.index, m.index + m[0].length]);
  }
  return regions;
}
function inDeadZone(pos, regions) {
  return regions.some(([s, e]) => pos >= s && pos < e);
}
function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s/>]*)))?/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1];
    const val = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[key] = val;
  }
  return attrs;
}
function parseElement(content, pos) {
  if (content[pos] !== "<") return null;
  const tagRe = /^<([a-zA-Z0-9_:-]+)((?:\s+[a-zA-Z0-9_:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s/>]*))?)*)?\s*(\/??>)/;
  const slice = content.slice(pos);
  const m = tagRe.exec(slice);
  if (!m) return null;
  const tag = m[1];
  const rawAttrs = (m[2] ?? "").trim();
  const closing = m[3];
  const attrs = parseAttrs(rawAttrs);
  if (closing === "/>") {
    return {
      node: { tag, attrs, children: [], selfClosing: true },
      end: pos + m[0].length
    };
  }
  let cursor = pos + m[0].length;
  const children = [];
  const closeTag = `</${tag}>`;
  while (cursor < content.length) {
    const nextOpen = content.indexOf("<", cursor);
    if (nextOpen === -1) break;
    if (content.startsWith(closeTag, nextOpen)) {
      return {
        node: { tag, attrs, children, selfClosing: false },
        end: nextOpen + closeTag.length
      };
    }
    if (content.startsWith("<!--", nextOpen)) {
      const commentEnd = content.indexOf("-->", nextOpen + 4);
      cursor = commentEnd !== -1 ? commentEnd + 3 : content.length;
      continue;
    }
    const child = parseElement(content, nextOpen);
    if (child) {
      children.push(child.node);
      cursor = child.end;
    } else {
      cursor = nextOpen + 1;
    }
  }
  return {
    node: { tag, attrs, children, selfClosing: false },
    end: cursor
  };
}
var WXP_TOP_TAGS = /* @__PURE__ */ new Set([
  "gsd-execute",
  "gsd-arguments",
  "gsd-paste",
  "gsd-include",
  "gsd-version"
]);
function extractWxpTags(content) {
  const deadZones = extractCodeFenceRegions(content);
  const matches = [];
  const tagStartRe = /<(gsd-[a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = tagStartRe.exec(content)) !== null) {
    const pos = m.index;
    if (inDeadZone(pos, deadZones)) continue;
    const tagName = m[1];
    if (!WXP_TOP_TAGS.has(tagName)) continue;
    const result = parseElement(content, pos);
    if (!result) continue;
    matches.push({ node: result.node, start: pos, end: result.end });
    tagStartRe.lastIndex = result.end;
  }
  return matches;
}
function spliceContent(content, start, end, replacement) {
  return content.slice(0, start) + replacement + content.slice(end);
}

// src/wxp/variables.ts
function createVariableStore() {
  const scalars = /* @__PURE__ */ new Map();
  const arrays = /* @__PURE__ */ new Map();
  const resolveScalar = (name) => {
    const direct = scalars.get(name)?.value;
    if (direct !== void 0) return direct;
    const dotIdx = name.indexOf(".");
    if (dotIdx === -1) return void 0;
    const varPart = name.slice(0, dotIdx);
    const pathPart = name.slice(dotIdx + 1);
    const jsonStr = scalars.get(varPart)?.value;
    if (jsonStr === void 0) return void 0;
    try {
      let obj = JSON.parse(jsonStr);
      for (const key of pathPart.split(".")) {
        if (obj === null || typeof obj !== "object") return void 0;
        obj = obj[key];
      }
      return obj === void 0 || obj === null ? void 0 : String(obj);
    } catch {
      return void 0;
    }
  };
  return {
    set(name, value, owner) {
      const existing = scalars.get(name);
      if (existing?.owner && owner && existing.owner !== owner) {
        scalars.delete(name);
        scalars.set(`${existing.owner}:${name}`, {
          name: `${existing.owner}:${name}`,
          value: existing.value,
          owner: existing.owner
        });
        scalars.set(`${owner}:${name}`, { name: `${owner}:${name}`, value, owner });
      } else {
        scalars.set(name, { name, value, owner });
      }
    },
    get(name) {
      return scalars.get(name)?.value;
    },
    resolve(name) {
      return resolveScalar(name);
    },
    setArray(name, items, owner) {
      arrays.set(name, items);
      scalars.set(name, { name, value: JSON.stringify(items), owner });
    },
    getArray(name) {
      if (arrays.has(name)) return arrays.get(name);
      const str = scalars.get(name)?.value;
      if (!str) return void 0;
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed.map(
          (item) => typeof item === "string" ? item : JSON.stringify(item)
        );
      } catch {
      }
      return void 0;
    },
    has(name) {
      return scalars.has(name) || arrays.has(name);
    },
    entries() {
      return scalars.entries();
    },
    snapshot() {
      const out = {};
      for (const [k, v] of scalars) out[k] = v.value;
      return out;
    }
  };
}

// src/wxp/arguments.ts
var WxpArgumentsError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WxpArgumentsError";
  }
};
function parseArguments(node, rawArguments, vars) {
  const settingsNode = node.children.find((c) => c.tag === "settings");
  const keepExtraArgs = settingsNode?.children.some((c) => c.tag === "keep-extra-args") ?? false;
  const strictArgs = settingsNode?.children.some((c) => c.tag === "strict-args") ?? false;
  const delimContainer = settingsNode?.children.find((c) => c.tag === "delimiters");
  const firstDelim = delimContainer?.children.find((c) => c.tag === "delimiter");
  let tokens;
  if (firstDelim) {
    const raw = firstDelim.attrs["value"] ?? "";
    const sep = raw === "\\n" ? "\n" : raw;
    tokens = rawArguments.split(sep).map((t) => t.trim()).filter(Boolean);
  } else {
    tokens = rawArguments.trim().split(/\s+/).filter(Boolean);
  }
  const argDefs = node.children.filter((c) => c.tag === "arg");
  const consumed = /* @__PURE__ */ new Set();
  for (const def of argDefs.filter((a) => a.attrs["type"] === "flag")) {
    const flagToken = def.attrs["flag"] ?? `--${def.attrs["name"]}`;
    const idx = tokens.indexOf(flagToken);
    const name = def.attrs["name"];
    if (!name) continue;
    if (idx === -1) {
      vars.set(name, "false", void 0);
    } else {
      vars.set(name, "true", void 0);
      consumed.add(idx);
    }
  }
  const positionals = argDefs.filter((a) => a.attrs["type"] !== "flag");
  const remaining = tokens.filter((_, i) => !consumed.has(i));
  let tokenIdx = 0;
  for (let i = 0; i < positionals.length; i++) {
    const def = positionals[i];
    const name = def.attrs["name"];
    const type = def.attrs["type"] ?? "string";
    const isLast = i === positionals.length - 1;
    if (!name) continue;
    if (tokenIdx >= remaining.length) {
      if (!("optional" in def.attrs)) {
        throw new WxpArgumentsError(`Missing required argument '${name}' (type: ${type})`);
      }
      vars.set(name, "", void 0);
      continue;
    }
    if (type === "string" && isLast) {
      vars.set(name, remaining.slice(tokenIdx).join(" "), void 0);
      tokenIdx = remaining.length;
    } else if (type === "number") {
      const raw = remaining[tokenIdx++];
      const num = Number(raw);
      if (isNaN(num)) throw new WxpArgumentsError(`Argument '${name}' expected a number, got '${raw}'`);
      vars.set(name, String(num), void 0);
    } else if (type === "boolean") {
      const raw = remaining[tokenIdx++].toLowerCase();
      if (raw !== "true" && raw !== "false") {
        throw new WxpArgumentsError(`Argument '${name}' expected true/false, got '${raw}'`);
      }
      vars.set(name, raw, void 0);
    } else {
      vars.set(name, remaining[tokenIdx++] ?? "", void 0);
    }
  }
  const extra = remaining.slice(tokenIdx).join(" ");
  if (extra) {
    if (strictArgs) throw new WxpArgumentsError(`Unexpected extra arguments: '${extra}'`);
    if (keepExtraArgs) vars.set("_extra", extra, void 0);
  }
}

// src/wxp/executor.ts
var import_node_fs = __toESM(require("fs"));
var import_node_path2 = __toESM(require("path"));

// src/wxp/shell.ts
var import_node_child_process = require("child_process");

// src/wxp/security.ts
var import_node_path = __toESM(require("path"));
var DEFAULT_SHELL_ALLOWLIST = [
  "pi-gsd-tools",
  "git",
  "node",
  "cat",
  "ls",
  "echo",
  "find"
];
function resolveTrustedEntry(entry, projectRoot, pkgRoot) {
  switch (entry.position) {
    case "project":
      return import_node_path.default.resolve(projectRoot, entry.path);
    case "pkg":
      return import_node_path.default.resolve(pkgRoot, entry.path);
    case "absolute":
      return import_node_path.default.resolve(entry.path);
  }
}
function checkTrustedPath(filePath, config, projectRoot, pkgRoot) {
  const resolved = import_node_path.default.resolve(filePath);
  const planningSegment = `${import_node_path.default.sep}.planning`;
  if (resolved.includes(`${planningSegment}${import_node_path.default.sep}`) || resolved.endsWith(planningSegment)) {
    return {
      ok: false,
      reason: ".planning/ files are never processed by WXP (hard security invariant)"
    };
  }
  for (const entry of config.untrustedPaths) {
    const untrustedAbs = resolveTrustedEntry(entry, projectRoot, pkgRoot);
    if (resolved.startsWith(untrustedAbs + import_node_path.default.sep) || resolved === untrustedAbs) {
      return { ok: false, reason: `File '${filePath}' is in an explicitly untrusted path: ${untrustedAbs}` };
    }
  }
  for (const entry of config.trustedPaths) {
    const trustedAbs = resolveTrustedEntry(entry, projectRoot, pkgRoot);
    if (resolved.startsWith(trustedAbs + import_node_path.default.sep) || resolved === trustedAbs) {
      return { ok: true };
    }
  }
  return {
    ok: false,
    reason: `File '${filePath}' is not in a trusted WXP path.`
  };
}
function checkAllowlist(command, config) {
  const bare = import_node_path.default.basename(command);
  if (config.shellBanlist.includes(bare)) {
    return { ok: false, reason: `Command '${bare}' is explicitly banned by WXP security config.` };
  }
  if (config.shellAllowlist.includes(bare)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Command '${bare}' is not in the WXP shell allowlist. Allowed: ${config.shellAllowlist.join(", ")}`
  };
}

// src/wxp/shell.ts
var WxpShellError = class extends Error {
  constructor(command, stderr, variableSnapshot, message) {
    super(message);
    this.command = command;
    this.stderr = stderr;
    this.variableSnapshot = variableSnapshot;
    this.name = "WxpShellError";
  }
  command;
  stderr;
  variableSnapshot;
};
function resolveArgNode(arg, vars) {
  if (arg.attrs["string"] !== void 0) return arg.attrs["string"];
  if (arg.attrs["name"] !== void 0) {
    const raw = vars.resolve(arg.attrs["name"]) ?? "";
    const wrap = arg.attrs["wrap"];
    return wrap ? `${wrap}${raw}${wrap}` : raw;
  }
  if (arg.attrs["value"] !== void 0) return arg.attrs["value"];
  return "";
}
function executeShell(node, vars, config) {
  const command = node.attrs["command"] ?? "";
  const check = checkAllowlist(command, config);
  if (!check.ok) {
    throw new WxpShellError(command, "", vars.snapshot(), check.reason);
  }
  const argsContainer = node.children.find((c) => c.tag === "args");
  const outsContainer = node.children.find((c) => c.tag === "outs");
  const resolvedArgs = argsContainer ? argsContainer.children.filter((c) => c.tag === "arg").map((a) => resolveArgNode(a, vars)) : [];
  const suppressErrors = outsContainer ? outsContainer.children.some((c) => c.tag === "suppress-errors") : false;
  const outVars = outsContainer ? outsContainer.children.filter((c) => c.tag === "out" && c.attrs["name"]).map((c) => c.attrs["name"]) : [];
  let stdout = "";
  try {
    stdout = (0, import_node_child_process.execFileSync)(command, resolvedArgs, {
      encoding: "utf8",
      timeout: config.shellTimeoutMs,
      windowsHide: true
    }).trim();
  } catch (err) {
    if (suppressErrors) {
      for (const name of outVars) vars.set(name, "", void 0);
      return;
    }
    const e = err;
    const stderr = (e.stderr ?? e.message ?? String(err)).trim();
    throw new WxpShellError(
      command,
      stderr,
      vars.snapshot(),
      `Shell '${command} ${resolvedArgs.join(" ")}' failed: ${stderr}`
    );
  }
  if (outVars.length > 0) vars.set(outVars[0], stdout, void 0);
}

// src/wxp/string-ops.ts
var WxpStringOpError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WxpStringOpError";
  }
};
function executeStringOp(node, vars) {
  const op = node.attrs["op"];
  if (op !== "split") throw new WxpStringOpError(`<string-op> only op="split" is supported in v1`);
  const argsContainer = node.children.find((c) => c.tag === "args");
  const outsContainer = node.children.find((c) => c.tag === "outs");
  if (!argsContainer || !outsContainer) {
    throw new WxpStringOpError(`<string-op> requires <args> and <outs>`);
  }
  const args = argsContainer.children.filter((c) => c.tag === "arg");
  const outs = outsContainer.children.filter((c) => c.tag === "out");
  const srcArg = args[0];
  const delimArg = args[1];
  if (!srcArg) throw new WxpStringOpError(`<string-op op="split"> requires at least 2 <arg> children`);
  const source = resolveArgNode(srcArg, vars);
  if (srcArg.attrs["name"] && vars.get(srcArg.attrs["name"]) === void 0) {
    throw new WxpStringOpError(`string-op split: source variable '${srcArg.attrs["name"]}' is not defined`);
  }
  const delimiter = delimArg ? resolveArgNode(delimArg, vars) : "";
  const parts = source.split(delimiter);
  outs.forEach((out, i) => {
    const name = out.attrs["name"];
    if (name) vars.set(name, parts[i + 1] ?? parts[i] ?? "", void 0);
  });
}

// src/wxp/conditions.ts
var BINARY_OPS = /* @__PURE__ */ new Set([
  "equals",
  "not-equals",
  "starts-with",
  "contains",
  "less-than",
  "greater-than",
  "less-than-or-equal",
  "greater-than-or-equal"
]);
var CONDITION_OPS = /* @__PURE__ */ new Set([...BINARY_OPS, "and", "or"]);
function resolveOperand(node, vars) {
  if (node.attrs["name"]) return vars.resolve(node.attrs["name"]) ?? "";
  if (node.attrs["value"] !== void 0) return node.attrs["value"];
  return "";
}
function isNumeric(node) {
  return node.attrs["type"] === "number";
}
function evalBinary(node, vars) {
  const leftNode = node.children.find((c) => c.tag === "left");
  const rightNode = node.children.find((c) => c.tag === "right");
  if (!leftNode || !rightNode) return false;
  const numeric = isNumeric(leftNode) || isNumeric(rightNode);
  if (numeric) {
    const l2 = Number(resolveOperand(leftNode, vars));
    const r2 = Number(resolveOperand(rightNode, vars));
    switch (node.tag) {
      case "equals":
        return l2 === r2;
      case "not-equals":
        return l2 !== r2;
      case "less-than":
        return l2 < r2;
      case "greater-than":
        return l2 > r2;
      case "less-than-or-equal":
        return l2 <= r2;
      case "greater-than-or-equal":
        return l2 >= r2;
      default:
        return false;
    }
  }
  const l = resolveOperand(leftNode, vars);
  const r = resolveOperand(rightNode, vars);
  switch (node.tag) {
    case "equals":
      return l === r;
    case "not-equals":
      return l !== r;
    case "starts-with":
      return l.startsWith(r);
    case "contains":
      return l.includes(r);
    case "less-than":
      return Number(l) < Number(r);
    case "greater-than":
      return Number(l) > Number(r);
    case "less-than-or-equal":
      return Number(l) <= Number(r);
    case "greater-than-or-equal":
      return Number(l) >= Number(r);
    default:
      return false;
  }
}
function evaluateCondExprNode(node, vars) {
  if (node.tag === "and") {
    return node.children.filter((c) => CONDITION_OPS.has(c.tag)).every((c) => evaluateCondExprNode(c, vars));
  }
  if (node.tag === "or") {
    return node.children.filter((c) => CONDITION_OPS.has(c.tag)).some((c) => evaluateCondExprNode(c, vars));
  }
  return evalBinary(node, vars);
}
function evaluateCondition(ifNode, vars) {
  const condContainer = ifNode.children.find((c) => c.tag === "condition");
  if (!condContainer) return false;
  const exprNode = condContainer.children.find((c) => CONDITION_OPS.has(c.tag));
  return exprNode ? evaluateCondExprNode(exprNode, vars) : false;
}
function evaluateWhere(whereNode, vars) {
  const exprNode = whereNode.children.find((c) => CONDITION_OPS.has(c.tag));
  return exprNode ? evaluateCondExprNode(exprNode, vars) : true;
}

// src/wxp/executor.ts
var WxpExecutionError = class extends Error {
  constructor(cause, variableSnapshot, message) {
    super(message);
    this.cause = cause;
    this.variableSnapshot = variableSnapshot;
    this.name = "WxpExecutionError";
  }
  cause;
  variableSnapshot;
};
function execDisplay(node, vars, ctx) {
  const msg = (node.attrs["msg"] ?? "").replace(
    /\{([^}]+)\}/g,
    (_, name) => vars.resolve(name) ?? ""
  );
  const level = node.attrs["level"];
  ctx.onDisplay(msg, level === "warning" || level === "error" ? level : "info");
}
function execJsonParse(node, vars) {
  const src = node.attrs["src"] ?? "";
  const out = node.attrs["out"] ?? "";
  const pathStr = node.attrs["path"];
  const jsonStr = vars.get(src);
  if (jsonStr === void 0) throw new Error(`<json-parse>: source variable '${src}' is not defined`);
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`<json-parse>: '${src}' does not contain valid JSON`);
  }
  if (pathStr) {
    const parts = pathStr.replace(/^\$\.?/, "").split(".");
    let cur = parsed;
    for (const key of parts) {
      if (cur === null || typeof cur !== "object") throw new Error(`<json-parse>: path '${pathStr}' not found`);
      cur = cur[key];
    }
    parsed = cur;
  }
  if (Array.isArray(parsed)) {
    vars.setArray(out, parsed.map((item) => typeof item === "string" ? item : JSON.stringify(item)));
  } else if (parsed !== null && typeof parsed === "object") {
    vars.set(out, JSON.stringify(parsed), void 0);
  } else {
    vars.set(out, parsed === void 0 || parsed === null ? "" : String(parsed), void 0);
  }
}
function execReadFile(node, vars) {
  const filePath = node.attrs["path"] ?? "";
  const out = node.attrs["out"] ?? "";
  const content = import_node_fs.default.readFileSync(import_node_path2.default.resolve(filePath), "utf8");
  vars.set(out, content, void 0);
}
function execWriteFile(node, vars, ctx) {
  const filePath = node.attrs["path"] ?? "";
  const src = node.attrs["src"] ?? "";
  const resolved = import_node_path2.default.resolve(filePath);
  if (import_node_fs.default.existsSync(resolved)) {
    throw new Error(`<write-file>: '${filePath}' already exists (create-only, never overwrites)`);
  }
  for (const entry of ctx.config.trustedPaths) {
    const abs = resolveTrustedEntry(entry, ctx.projectRoot, ctx.pkgRoot);
    if (resolved.startsWith(abs + import_node_path2.default.sep) || resolved === abs) {
      throw new Error(`<write-file>: cannot write to trusted harness path '${filePath}'`);
    }
  }
  const content = vars.get(src) ?? "";
  import_node_fs.default.mkdirSync(import_node_path2.default.dirname(resolved), { recursive: true });
  import_node_fs.default.writeFileSync(resolved, content, "utf8");
}
function execForEach(node, vars, ctx) {
  const varName = node.attrs["var"] ?? "";
  const itemName = node.attrs["item"] ?? "";
  const whereNode = node.children.find((c) => c.tag === "where");
  const sortByNode = node.children.find((c) => c.tag === "sort-by");
  const bodyNodes = node.children.filter((c) => c.tag !== "where" && c.tag !== "sort-by");
  let items = vars.getArray(varName);
  if (!items) return;
  if (whereNode) {
    items = items.filter((itemJson) => {
      vars.set(itemName, itemJson, void 0);
      return evaluateWhere(whereNode, vars);
    });
  }
  if (sortByNode) {
    const key = sortByNode.attrs["key"] ?? "";
    const type = sortByNode.attrs["type"] ?? "string";
    const order = sortByNode.attrs["order"] ?? "asc";
    items = [...items].sort((aJson, bJson) => {
      vars.set(itemName, aJson, void 0);
      const aVal = vars.resolve(`${itemName}.${key}`) ?? vars.resolve(key) ?? "";
      vars.set(itemName, bJson, void 0);
      const bVal = vars.resolve(`${itemName}.${key}`) ?? vars.resolve(key) ?? "";
      const cmp = type === "number" ? Number(aVal) - Number(bVal) : aVal.localeCompare(bVal);
      return order === "desc" ? -cmp : cmp;
    });
  }
  for (const itemJson of items) {
    vars.set(itemName, itemJson, void 0);
    for (const child of bodyNodes) executeNode(child, vars, ctx);
  }
}
function executeNode(node, vars, ctx) {
  switch (node.tag) {
    case "shell":
      executeShell(node, vars, ctx.config);
      break;
    case "string-op":
      executeStringOp(node, vars);
      break;
    case "json-parse":
      execJsonParse(node, vars);
      break;
    case "read-file":
      execReadFile(node, vars);
      break;
    case "write-file":
      execWriteFile(node, vars, ctx);
      break;
    case "display":
      execDisplay(node, vars, ctx);
      break;
    case "for-each":
      execForEach(node, vars, ctx);
      break;
    case "if": {
      const branch = evaluateCondition(node, vars);
      const thenNode = node.children.find((c) => c.tag === "then");
      const elseNode = node.children.find((c) => c.tag === "else");
      const taken = branch ? thenNode : elseNode;
      if (taken) for (const child of taken.children) executeNode(child, vars, ctx);
      break;
    }
    case "gsd-execute":
      executeBlock(node, vars, ctx);
      break;
    default:
      break;
  }
}
function executeBlock(node, vars, ctx) {
  try {
    for (const child of node.children) executeNode(child, vars, ctx);
  } catch (err) {
    if (err instanceof WxpShellError || err instanceof Error) {
      throw new WxpExecutionError(err, vars.snapshot(), `Execution failed: ${err.message}`);
    }
    throw err;
  }
}

// src/wxp/paste.ts
var WxpPasteError = class extends Error {
  constructor(variableName, variableSnapshot) {
    super(
      `<gsd-paste name="${variableName}" /> references undefined variable '${variableName}'`
    );
    this.variableName = variableName;
    this.variableSnapshot = variableSnapshot;
    this.name = "WxpPasteError";
  }
  variableName;
  variableSnapshot;
};
function applyPaste(content, vars) {
  const deadZones = extractCodeFenceRegions(content);
  const pasteRe = /<gsd-paste\s+name="([^"]+)"\s*\/>/g;
  const matches = [];
  let m;
  while ((m = pasteRe.exec(content)) !== null) {
    if (!inDeadZone(m.index, deadZones)) {
      matches.push({ index: m.index, full: m[0], name: m[1] });
    }
  }
  for (const match of matches) {
    if (vars.get(match.name) === void 0) {
      throw new WxpPasteError(match.name, vars.snapshot());
    }
  }
  let result = content;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const value = vars.get(match.name);
    result = result.slice(0, match.index) + value + result.slice(match.index + match.full.length);
  }
  return result;
}

// src/wxp/index.ts
var MAX_ITERATIONS = 50;
var NOOP_DISPLAY = () => {
};
var WxpProcessingError = class extends Error {
  constructor(filePath, cause, variableSnapshot, pendingOperations, completedOperations) {
    super(
      [
        `WXP Processing Error`,
        `File: ${filePath}`,
        `Error: ${cause.message}`,
        `Variable Namespace: ${JSON.stringify(variableSnapshot, null, 2)}`,
        `Pending Operations: [${pendingOperations.join(", ")}]`,
        `Completed Operations: [${completedOperations.join(", ")}]`
      ].join("\n")
    );
    this.filePath = filePath;
    this.cause = cause;
    this.variableSnapshot = variableSnapshot;
    this.pendingOperations = pendingOperations;
    this.completedOperations = completedOperations;
    this.name = "WxpProcessingError";
  }
  filePath;
  cause;
  variableSnapshot;
  pendingOperations;
  completedOperations;
};
function processWxpTrustedContent(content, virtualFilePath, config, projectRoot, pkgRoot, rawArguments = "", onDisplay = NOOP_DISPLAY) {
  const trusted = {
    ...config,
    trustedPaths: [
      ...config.trustedPaths,
      { position: "absolute", path: import_node_path3.default.dirname(import_node_path3.default.resolve(virtualFilePath)) }
    ]
  };
  return runLoop(content, virtualFilePath, trusted, projectRoot, pkgRoot, rawArguments, onDisplay);
}
function runLoop(content, filePath, config, projectRoot, pkgRoot, rawArguments, onDisplay) {
  const vars = createVariableStore();
  const done = [];
  let current = content;
  const ctx = { config, projectRoot, pkgRoot, onDisplay };
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const tags = extractWxpTags(current);
    const active = tags.filter((t) => t.node.tag !== "gsd-version");
    if (active.length === 0) break;
    const pending = active.map((t) => t.node.tag);
    try {
      let progress = false;
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-include") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;
        const incPath = tag.node.attrs["path"];
        if (!incPath) continue;
        const abs = import_node_path3.default.resolve(import_node_path3.default.dirname(filePath), incPath);
        const check = checkTrustedPath(abs, config, projectRoot, pkgRoot);
        if (!check.ok) throw new Error(`Include rejected: ${check.reason}`);
        const included = import_node_fs2.default.readFileSync(abs, "utf8");
        const stem = import_node_path3.default.basename(abs, import_node_path3.default.extname(abs));
        for (const child of tag.node.children) {
          if (child.tag !== "gsd-arguments") continue;
          for (const arg of child.children.filter((c) => c.tag === "arg")) {
            const from = arg.attrs["name"];
            const to = arg.attrs["as"];
            if (from && to) {
              const val = vars.get(from);
              if (val !== void 0) vars.set(to, val, stem);
            }
          }
        }
        const appendArgs = "include-arguments" in tag.node.attrs ? `
${rawArguments}` : "";
        current = spliceContent(current, tag.start, tag.end, included + appendArgs);
        done.push("gsd-include");
        progress = true;
        break;
      }
      if (progress) continue;
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-arguments") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;
        parseArguments(tag.node, rawArguments, vars);
        current = spliceContent(current, tag.start, tag.end, "");
        done.push("gsd-arguments");
        progress = true;
        break;
      }
      if (progress) continue;
      for (const tag of extractWxpTags(current)) {
        if (tag.node.tag !== "gsd-execute") continue;
        if (inDeadZone(tag.start, extractCodeFenceRegions(current))) continue;
        executeBlock(tag.node, vars, ctx);
        current = spliceContent(current, tag.start, tag.end, "");
        done.push("gsd-execute");
        progress = true;
        break;
      }
      if (progress) continue;
      const after = applyPaste(current, vars);
      if (after !== current) {
        current = after;
        done.push("gsd-paste");
        continue;
      }
      break;
    } catch (err) {
      if (err instanceof WxpProcessingError) throw err;
      const e = err instanceof Error ? err : new Error(String(err));
      throw new WxpProcessingError(filePath, e, vars.snapshot(), pending, done);
    }
  }
  return current;
}
function readWorkflowVersionTag(content) {
  const m = /<gsd-version\s+v="([^"]+)"(\s+do-not-update)?\s*\/>/.exec(content);
  if (!m) return null;
  return { version: m[1], doNotUpdate: Boolean(m[2]) };
}

// .gsd/extensions/pi-gsd-hooks.ts
function copyHarness(src, dest) {
  let symlinksReplaced = 0;
  let filesCopied = 0;
  const walk = (srcDir, destDir) => {
    (0, import_node_fs3.mkdirSync)(destDir, { recursive: true });
    const entries = (0, import_node_fs3.readdirSync)(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = (0, import_node_path4.join)(srcDir, entry.name);
      const destPath = (0, import_node_path4.join)(destDir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath, destPath);
        continue;
      }
      if ((0, import_node_fs3.existsSync)(destPath)) {
        try {
          const st = (0, import_node_fs3.lstatSync)(destPath);
          if (st.isSymbolicLink()) {
            try {
              const { unlinkSync } = require("fs");
              unlinkSync(destPath);
            } catch {
            }
            (0, import_node_fs3.copyFileSync)(srcPath, destPath);
            symlinksReplaced++;
          }
        } catch {
        }
        continue;
      }
      try {
        (0, import_node_fs3.copyFileSync)(srcPath, destPath);
        filesCopied++;
      } catch {
      }
    }
  };
  walk(src, dest);
  return { symlinksReplaced, filesCopied };
}
function extractRawArguments(content) {
  const lastTagEnd = (() => {
    const tagPattern = /<\/(?:gsd-[a-zA-Z0-9_-]+|shell|if|then|else|condition|args|outs|string-op|settings)>/g;
    let lastEnd = 0;
    let m;
    while ((m = tagPattern.exec(content)) !== null) {
      lastEnd = m.index + m[0].length;
    }
    return lastEnd;
  })();
  const trailing = content.slice(lastTagEnd).trim();
  if (trailing.length === 0 || trailing.length > 500 || trailing.includes("\n\n\n")) {
    return "";
  }
  return trailing;
}
function pi_gsd_hooks_default(pi) {
  function resolveGsdInclude(match, cwd, pkgHarness, errors) {
    const filePath = match[1];
    const selectExpr = match[2] ?? "";
    const subPath = filePath.replace(/^\.pi\/gsd\//, "");
    const candidates = [
      (0, import_node_path4.join)(cwd, filePath),
      ...filePath.startsWith(".pi/gsd/") && pkgHarness ? [(0, import_node_path4.join)(pkgHarness, subPath)] : []
    ];
    let raw = null;
    for (const c of candidates) {
      try {
        if ((0, import_node_fs3.existsSync)(c)) {
          raw = (0, import_node_fs3.readFileSync)(c, "utf8");
          break;
        }
      } catch {
      }
    }
    if (raw === null) {
      errors.push("File not found: " + filePath);
      return null;
    }
    let result = raw;
    if (!selectExpr) return result;
    const parts = selectExpr.split("|");
    if (parts.length > 2) {
      errors.push("Invalid selector (max 2 segments): " + selectExpr);
      return null;
    }
    if (parts.length > 1 && parts.some((p) => p.trim().startsWith("lines:"))) {
      errors.push("lines: cannot be chained \u2014 use it alone: " + selectExpr);
      return null;
    }
    for (const part of parts) {
      const p = part.trim();
      if (p.startsWith("tag:")) {
        const tagName = p.slice(4);
        const tagRe = new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i");
        const tagMatch = result.match(tagRe);
        if (!tagMatch) {
          errors.push("Tag <" + tagName + "> not found in " + filePath);
          return null;
        }
        result = tagMatch[1].trim();
      } else if (p.startsWith("heading:")) {
        const headingText = p.slice(8);
        const escaped = headingText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const headingRe = new RegExp("(^|\\n)(#{1,6})\\s+" + escaped + "\\s*\\n");
        const hMatch = result.match(headingRe);
        if (!hMatch) {
          errors.push('Heading "' + headingText + '" not found in ' + filePath);
          return null;
        }
        const level = hMatch[2].length;
        const startIdx = (hMatch.index ?? 0) + hMatch[0].length;
        const nextHeading = result.slice(startIdx).search(new RegExp("\\n#{1," + level + "}\\s"));
        result = nextHeading === -1 ? result.slice(startIdx).trim() : result.slice(startIdx, startIdx + nextHeading).trim();
      } else if (p.startsWith("lines:")) {
        const rangeMatch = p.match(/^lines:(\d+)-(\d+)$/);
        if (!rangeMatch) {
          errors.push("Invalid lines selector: " + p);
          return null;
        }
        const start = parseInt(rangeMatch[1], 10) - 1;
        const end = parseInt(rangeMatch[2], 10);
        result = result.split("\n").slice(start, end).join("\n");
      } else {
        errors.push("Unknown selector: " + p);
        return null;
      }
    }
    return result;
  }
  pi.on("context", async (event, ctx) => {
    const includePattern = /<gsd-include\s+path="([^"]+)"(?:\s+select="([^"]*)")?\s*\/>/g;
    const extFile = typeof __filename !== "undefined" ? __filename : "";
    const pkgHarness = extFile ? (0, import_node_path4.join)((0, import_node_path4.dirname)(extFile), "..", "harnesses", "pi", "get-shit-done") : "";
    const errors = [];
    const messages = event.messages;
    for (const msg of messages) {
      if (msg.role !== "user") continue;
      if (typeof msg.content === "string") {
        const includes = [...msg.content.matchAll(includePattern)];
        if (includes.length === 0) continue;
        let transformed = msg.content;
        for (const match of includes) {
          const replacement = resolveGsdInclude(match, ctx.cwd, pkgHarness, errors);
          if (replacement === null) continue;
          transformed = transformed.replace(match[0], replacement);
        }
        msg.content = transformed;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type !== "text" || !block.text) continue;
          const includes = [...block.text.matchAll(includePattern)];
          if (includes.length === 0) continue;
          let transformed = block.text;
          for (const match of includes) {
            const replacement = resolveGsdInclude(match, ctx.cwd, pkgHarness, errors);
            if (replacement === null) continue;
            transformed = transformed.replace(match[0], replacement);
          }
          block.text = transformed;
        }
      }
    }
    if (errors.length > 0) {
      ctx.ui.notify("\u274C GSD include failed:\n" + errors.map((e) => "  \u2022 " + e).join("\n"), "error");
      return { messages: [] };
    }
    const extFile2 = typeof __filename !== "undefined" ? __filename : "";
    const pkgRoot2 = (0, import_node_path4.join)((0, import_node_path4.dirname)(extFile2), "..", "..");
    const loadSettings = (settingsPath) => {
      try {
        if ((0, import_node_fs3.existsSync)(settingsPath)) {
          return JSON.parse((0, import_node_fs3.readFileSync)(settingsPath, "utf8"));
        }
      } catch {
      }
      return {};
    };
    const globalSettings = loadSettings((0, import_node_path4.join)((0, import_node_os.homedir)(), ".gsd", "pi-gsd-settings.json"));
    const projectSettings = loadSettings((0, import_node_path4.join)(ctx.cwd, ".pi", "gsd", "pi-gsd-settings.json"));
    const mergedAllowlist = [
      ...DEFAULT_SHELL_ALLOWLIST,
      ...globalSettings.shellAllowlist ?? [],
      ...projectSettings.shellAllowlist ?? []
    ];
    const wxpSecurity = {
      trustedPaths: [
        ...globalSettings.trustedPaths ?? [],
        ...projectSettings.trustedPaths ?? [],
        { position: "pkg", path: ".gsd/harnesses/pi/get-shit-done" },
        { position: "project", path: ".pi/gsd" }
      ],
      untrustedPaths: [
        ...globalSettings.untrustedPaths ?? [],
        ...projectSettings.untrustedPaths ?? []
      ],
      shellAllowlist: [...new Set(mergedAllowlist)],
      shellBanlist: [
        ...globalSettings.shellBanlist ?? [],
        ...projectSettings.shellBanlist ?? []
      ],
      shellTimeoutMs: projectSettings.shellTimeoutMs ?? globalSettings.shellTimeoutMs ?? 3e4
    };
    try {
      for (const msg of messages) {
        if (msg.role !== "user") continue;
        if (typeof msg.content === "string") {
          if (!msg.content.includes("<gsd-")) continue;
          const virtualPath = (0, import_node_path4.join)(ctx.cwd, ".pi", "gsd", "workflows", "_message.md");
          const rawArgs = extractRawArguments(msg.content);
          msg.content = processWxpTrustedContent(msg.content, virtualPath, wxpSecurity, ctx.cwd, pkgRoot2, rawArgs, (m, lv) => ctx.ui.notify(m, lv === "error" ? "error" : "info"));
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type !== "text" || !block.text) continue;
            if (!block.text.includes("<gsd-")) continue;
            const virtualPath = (0, import_node_path4.join)(ctx.cwd, ".pi", "gsd", "workflows", "_message.md");
            const rawArgs = extractRawArguments(block.text);
            block.text = processWxpTrustedContent(block.text, virtualPath, wxpSecurity, ctx.cwd, pkgRoot2, rawArgs, (m, lv) => ctx.ui.notify(m, lv === "error" ? "error" : "info"));
          }
        }
      }
    } catch (wxpErr) {
      if (wxpErr instanceof WxpProcessingError) {
        ctx.ui.notify(wxpErr.message, "error");
        return { messages: [] };
      }
      const errMsg = wxpErr instanceof Error ? wxpErr.message : String(wxpErr);
      ctx.ui.notify(`GSD WXP: unexpected context error: ${errMsg}`, "info");
    }
    return { messages };
  });
  pi.on("session_start", async (_event, ctx) => {
    try {
      const extFile = typeof __filename !== "undefined" ? __filename : "";
      const pkgRoot = (0, import_node_path4.join)((0, import_node_path4.dirname)(extFile), "..", "..");
      const pkgHarness = (0, import_node_path4.join)(pkgRoot, ".gsd", "harnesses", "pi", "get-shit-done");
      const projectHarness = (0, import_node_path4.join)(ctx.cwd, ".pi", "gsd");
      if ((0, import_node_fs3.existsSync)(pkgHarness)) {
        const { symlinksReplaced } = copyHarness(pkgHarness, projectHarness);
        if (symlinksReplaced > 0) {
          ctx.ui.notify(
            `\u2139\uFE0F GSD: Replaced ${symlinksReplaced} symlink(s) in .pi/gsd/ with real file copies.`,
            "info"
          );
        }
        try {
          const pkgJsonPath = (0, import_node_path4.join)(pkgRoot, "package.json");
          if ((0, import_node_fs3.existsSync)(pkgJsonPath)) {
            const pkgVersion = JSON.parse((0, import_node_fs3.readFileSync)(pkgJsonPath, "utf8")).version ?? "0.0.0";
            const outdated = [];
            const sampleFiles = ["workflows/execute-phase.md", "workflows/plan-phase.md"];
            for (const rel of sampleFiles) {
              const projFile = (0, import_node_path4.join)(projectHarness, rel);
              if (!(0, import_node_fs3.existsSync)(projFile)) continue;
              const content = (0, import_node_fs3.readFileSync)(projFile, "utf8");
              const vtag = readWorkflowVersionTag(content);
              if (!vtag || vtag.doNotUpdate) continue;
              if (vtag.version !== pkgVersion) outdated.push(rel);
            }
            if (outdated.length > 0) {
              ctx.ui.notify(
                `\u2139\uFE0F GSD harness update available (package v${pkgVersion}).
Outdated files: ${outdated.join(", ")}
Run: pi-gsd-tools harness update [y|n|pick|diff]`,
                "info"
              );
            }
          }
        } catch {
        }
      }
    } catch {
    }
    try {
      const cacheDir = (0, import_node_path4.join)((0, import_node_os.homedir)(), ".pi", "cache");
      const cacheFile = (0, import_node_path4.join)(cacheDir, "gsd-update-check.json");
      const CACHE_TTL_SECONDS = 86400;
      if ((0, import_node_fs3.existsSync)(cacheFile)) {
        try {
          const cache = JSON.parse((0, import_node_fs3.readFileSync)(cacheFile, "utf8"));
          const ageSeconds = Math.floor(Date.now() / 1e3) - (cache.checked ?? 0);
          if (cache.update_available && cache.latest) {
            ctx.ui.notify(
              `GSD update available: ${cache.installed ?? "?"} \u2192 ${cache.latest}. Run: npm i -g pi-gsd`,
              "info"
            );
          }
          if (ageSeconds < CACHE_TTL_SECONDS) return;
        } catch {
        }
      }
      setTimeout(() => {
        try {
          (0, import_node_fs3.mkdirSync)(cacheDir, { recursive: true });
          let installed = "0.0.0";
          const versionPaths = [
            (0, import_node_path4.join)(ctx.cwd, ".pi", "gsd", "VERSION"),
            (0, import_node_path4.join)((0, import_node_os.homedir)(), ".pi", "gsd", "VERSION")
          ];
          for (const vp of versionPaths) {
            if ((0, import_node_fs3.existsSync)(vp)) {
              try {
                installed = (0, import_node_fs3.readFileSync)(vp, "utf8").trim();
                break;
              } catch {
              }
            }
          }
          let latest = null;
          try {
            latest = (0, import_node_child_process2.execSync)("npm view pi-gsd version", {
              encoding: "utf8",
              timeout: 1e4,
              windowsHide: true
            }).trim();
          } catch {
          }
          (0, import_node_fs3.writeFileSync)(
            cacheFile,
            JSON.stringify({
              update_available: latest !== null && installed !== "0.0.0" && installed !== latest,
              installed,
              latest: latest ?? "unknown",
              checked: Math.floor(Date.now() / 1e3)
            })
          );
        } catch {
        }
      }, 3e3);
    } catch {
    }
  });
  pi.on("tool_call", async (event, ctx) => {
    try {
      if (event.toolName !== "write" && event.toolName !== "edit")
        return void 0;
      const filePath = event.input.path ?? "";
      if (filePath.includes(".planning/")) return void 0;
      const allowed = [
        /\.gitignore$/,
        /\.env/,
        /AGENTS\.md$/,
        /settings\.json$/,
        /pi-gsd-hooks\.ts$/
      ];
      if (allowed.some((p) => p.test(filePath))) return void 0;
      const configPath = (0, import_node_path4.join)(ctx.cwd, ".planning", "config.json");
      if (!(0, import_node_fs3.existsSync)(configPath)) return void 0;
      try {
        const config = JSON.parse((0, import_node_fs3.readFileSync)(configPath, "utf8"));
        if (!config.hooks?.workflow_guard) return void 0;
      } catch {
        return void 0;
      }
      const fileName = filePath.split("/").pop() ?? filePath;
      ctx.ui.notify(
        `\u26A0\uFE0F GSD: Editing ${fileName} outside a GSD workflow. Consider /gsd-fast or /gsd-quick to maintain state tracking.`,
        "info"
      );
    } catch {
    }
    return void 0;
  });
  const runJson = (args, cwd) => {
    try {
      const raw = (0, import_node_child_process2.execSync)(
        `pi-gsd-tools ${args} --raw --cwd ${JSON.stringify(cwd)}`,
        { encoding: "utf8", timeout: 1e4, windowsHide: true }
      ).trim();
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const bar = (pct, width = 20) => {
    const filled = Math.round(pct / 100 * width);
    return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
  };
  const cap = (s, max = 42) => s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
  const nextSteps = (phases) => {
    const pending = phases.filter((p) => p.status !== "Complete");
    if (pending.length === 0) {
      return [
        "  \u2705 All phases complete!",
        "  \u2192 /gsd-audit-milestone      Review before archiving",
        "  \u2192 /gsd-complete-milestone   Archive and start next"
      ];
    }
    const next = pending[0];
    const n = next.number;
    const lines = [`  \u23F3 Phase ${n}: ${cap(next.name)}`];
    if (next.plans === 0) {
      lines.push(`  \u2192 /gsd-discuss-phase ${n}    Gather context first`);
      lines.push(`  \u2192 /gsd-plan-phase ${n}       Jump straight to planning`);
    } else if (next.summaries < next.plans) {
      lines.push(
        `  \u2192 /gsd-execute-phase ${n}    ${next.summaries}/${next.plans} plans done`
      );
    } else {
      lines.push(`  \u2192 /gsd-verify-work ${n}      All plans done, verify UAT`);
    }
    lines.push(`  \u2192 /gsd-next                Auto-advance`);
    if (pending.length > 1) {
      lines.push(
        `  (+ ${pending.length - 1} more phase${pending.length > 2 ? "s" : ""} pending)`
      );
    }
    return lines;
  };
  const formatProgress = (cwd) => {
    const data = runJson("progress json", cwd);
    if (!data)
      return {
        text: "\u274C No GSD project found. Run /gsd-new-project to initialise.",
        data: null
      };
    const done = data.phases.filter((p) => p.status === "Complete").length;
    const total = data.phases.length;
    const phasePct = total > 0 ? Math.round(done / total * 100) : 0;
    const planPct = data.total_plans > 0 ? Math.round(data.total_summaries / data.total_plans * 100) : 0;
    const lines = [
      `\u2501\u2501 GSD Progress \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
      `\u{1F4CB}  ${data.milestone_name} (${data.milestone_version})`,
      ``,
      `Phases  ${bar(phasePct)}  ${done}/${total} (${phasePct}%)`,
      `Plans   ${bar(planPct)}  ${data.total_summaries}/${data.total_plans} (${planPct}%)`,
      ``,
      `Next steps:`,
      ...nextSteps(data.phases),
      ``,
      `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`
    ];
    return { text: lines.join("\n"), data };
  };
  const formatStats = (cwd) => {
    const data = runJson("stats json", cwd);
    if (!data)
      return {
        text: "\u274C No GSD project found. Run /gsd-new-project to initialise.",
        data: null
      };
    const reqPct = data.requirements_total > 0 ? Math.round(
      data.requirements_complete / data.requirements_total * 100
    ) : 0;
    const lines = [
      `\u2501\u2501 GSD Stats \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
      `\u{1F4CB}  ${data.milestone_name} (${data.milestone_version})`,
      ``,
      `Phases  ${bar(data.percent)}  ${data.phases_completed}/${data.phases_total} (${data.percent}%)`,
      `Plans   ${bar(data.plan_percent)}  ${data.total_summaries}/${data.total_plans} (${data.plan_percent}%)`,
      `Reqs    ${bar(reqPct)}  ${data.requirements_complete}/${data.requirements_total} (${reqPct}%)`,
      ``,
      `\u{1F5C2}  Git commits:   ${data.git_commits}`,
      `\u{1F4C5}  Started:       ${data.git_first_commit_date}`,
      `\u{1F4C5}  Last activity: ${data.last_activity}`,
      ``,
      `Next steps:`,
      ...nextSteps(data.phases),
      ``,
      `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`
    ];
    return { text: lines.join("\n"), data };
  };
  const formatHealth = (cwd, repair) => {
    const data = runJson(
      `validate health${repair ? " --repair" : ""}`,
      cwd
    );
    if (!data)
      return "\u274C No GSD project found. Run /gsd-new-project to initialise.";
    const icon = data.status === "ok" ? "\u2705" : data.status === "broken" ? "\u274C" : "\u26A0\uFE0F";
    const lines = [
      `\u2501\u2501 GSD Health \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
      `${icon}  Status: ${data.status.toUpperCase()}`
    ];
    if (data.errors?.length) {
      lines.push(``, `Errors (${data.errors.length}):`);
      for (const e of data.errors) {
        lines.push(`  \u2717 [${e.code}] ${e.message}`);
        if (e.repair) lines.push(`      fix: ${e.repair}`);
      }
    }
    if (data.warnings?.length) {
      lines.push(``, `Warnings (${data.warnings.length}):`);
      for (const w of data.warnings) {
        lines.push(`  \u26A0 [${w.code}] ${w.message}`);
      }
    }
    if (data.status !== "ok" && !repair) {
      lines.push(``, `  \u2192 /gsd-health --repair   Auto-fix all issues`);
    }
    lines.push(``, `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
    return lines.join("\n");
  };
  const nextCommand = (phases) => {
    const pending = phases.filter((p) => p.status !== "Complete");
    if (pending.length === 0) return "/gsd-audit-milestone";
    const next = pending[0];
    const n = next.number;
    if (next.plans === 0) return `/gsd-discuss-phase ${n}`;
    if (next.summaries < next.plans) return `/gsd-execute-phase ${n}`;
    return `/gsd-verify-work ${n}`;
  };
  pi.registerCommand("gsd-progress", {
    description: "Show project progress with next steps (instant)",
    handler: async (_args, ctx) => {
      const { text, data } = formatProgress(ctx.cwd);
      ctx.ui.notify(text, "info");
      if (data) {
        const cmd = nextCommand(data.phases);
        if (cmd) ctx.ui.setEditorText(cmd);
      }
    }
  });
  pi.registerCommand("gsd-stats", {
    description: "Show project statistics (instant)",
    handler: async (_args, ctx) => {
      const { text, data } = formatStats(ctx.cwd);
      ctx.ui.notify(text, "info");
      if (data) {
        const cmd = nextCommand(data.phases);
        if (cmd) ctx.ui.setEditorText(cmd);
      }
    }
  });
  pi.registerCommand("gsd-health", {
    description: "Check .planning/ integrity (instant)",
    handler: async (args, ctx) => {
      ctx.ui.notify(
        formatHealth(ctx.cwd, !!args?.includes("--repair")),
        "info"
      );
    },
    getArgumentCompletions: (prefix) => {
      const options = [
        { value: "--repair", label: "--repair  Auto-fix issues" }
      ];
      return options.filter((o) => o.value.startsWith(prefix));
    }
  });
  pi.registerCommand("gsd-next", {
    description: "Auto-advance to the next GSD action (instant, no LLM)",
    handler: async (_args, ctx) => {
      const data = runJson("progress json", ctx.cwd);
      if (!data) {
        ctx.ui.notify(
          "\u274C No GSD project found. Run /gsd-new-project to initialise.",
          "error"
        );
        ctx.ui.setEditorText("/gsd-new-project");
        return;
      }
      const pending = data.phases.filter((p) => p.status !== "Complete");
      if (pending.length === 0) {
        ctx.ui.notify(
          [
            `\u2501\u2501 GSD Next \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
            `\u2705  All phases complete!`,
            `\u2192   /gsd-audit-milestone`,
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`
          ].join("\n"),
          "info"
        );
        ctx.ui.setEditorText("/gsd-audit-milestone");
        return;
      }
      const next = pending[0];
      const n = next.number;
      let action;
      let reason;
      if (next.plans === 0) {
        action = `/gsd-discuss-phase ${n}`;
        reason = `Phase ${n} has no plans yet \u2014 start with discussion`;
      } else if (next.summaries < next.plans) {
        action = `/gsd-execute-phase ${n}`;
        reason = `Phase ${n}: ${next.summaries}/${next.plans} plans done \u2014 continue execution`;
      } else {
        action = `/gsd-verify-work ${n}`;
        reason = `Phase ${n}: all plans done \u2014 verify UAT`;
      }
      ctx.ui.notify(
        [
          `\u2501\u2501 GSD Next \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
          `\u23E9  ${reason}`,
          `\u2192   ${action}`,
          ...pending.length > 1 ? [
            `    (${pending.length - 1} more phase${pending.length > 2 ? "s" : ""} pending after this)`
          ] : [],
          `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`
        ].join("\n"),
        "info"
      );
      ctx.ui.setEditorText(action);
    }
  });
  pi.registerCommand("gsd-help", {
    description: "List all GSD commands (instant)",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        [
          "\u2501\u2501 GSD Commands \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
          "Lifecycle:",
          "  /gsd-new-project        Initialise project",
          "  /gsd-new-milestone      Start next milestone",
          "  /gsd-discuss-phase N    Discuss before planning",
          "  /gsd-plan-phase N       Create phase plan",
          "  /gsd-execute-phase N    Execute phase",
          "  /gsd-verify-work N      UAT testing",
          "  /gsd-validate-phase N   Validate completion",
          "  /gsd-next               Auto-advance",
          "  /gsd-autonomous         Run all phases",
          "  /gsd-plan-milestone     Plan all phases at once",
          "  /gsd-execute-milestone  Execute all phases with gates",
          "",
          "Quick:",
          "  /gsd-quick <task>       Tracked ad-hoc task",
          "  /gsd-fast <task>        Inline, no subagents",
          "  /gsd-do <text>          Route automatically",
          "  /gsd-debug              Debug session",
          "",
          "Instant (no LLM):",
          "  /gsd-progress           Progress + next steps",
          "  /gsd-stats              Full statistics",
          "  /gsd-health [--repair]  .planning/ integrity",
          "  /gsd-help               This list",
          "",
          "Management:",
          "  /gsd-setup-pi           Wire pi extension",
          "  /gsd-set-profile <p>    quality|balanced|budget",
          "  /gsd-settings           Workflow toggles",
          "  /gsd-progress           Roadmap overview",
          "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        ].join("\n"),
        "info"
      );
    }
  });
  const WARNING_THRESHOLD = 35;
  const CRITICAL_THRESHOLD = 25;
  const DEBOUNCE_CALLS = 5;
  let callsSinceWarn = 0;
  let lastLevel = null;
  pi.on("tool_result", async (_event, ctx) => {
    try {
      const usage = ctx.getContextUsage();
      if (!usage || usage.percent === null) return void 0;
      const usedPct = Math.round(usage.percent);
      const remaining = 100 - usedPct;
      if (remaining > WARNING_THRESHOLD) {
        callsSinceWarn++;
        return void 0;
      }
      const configPath = (0, import_node_path4.join)(ctx.cwd, ".planning", "config.json");
      if ((0, import_node_fs3.existsSync)(configPath)) {
        try {
          const config = JSON.parse((0, import_node_fs3.readFileSync)(configPath, "utf8"));
          if (config.hooks?.context_warnings === false) return void 0;
        } catch {
        }
      }
      const isCritical = remaining <= CRITICAL_THRESHOLD;
      const currentLevel = isCritical ? "critical" : "warning";
      callsSinceWarn++;
      const severityEscalated = currentLevel === "critical" && lastLevel === "warning";
      if (lastLevel !== null && callsSinceWarn < DEBOUNCE_CALLS && !severityEscalated) {
        return void 0;
      }
      callsSinceWarn = 0;
      lastLevel = currentLevel;
      const isGsdActive = (0, import_node_fs3.existsSync)((0, import_node_path4.join)(ctx.cwd, ".planning", "STATE.md"));
      let msg;
      if (isCritical) {
        msg = isGsdActive ? `\u{1F534} CONTEXT CRITICAL: ${usedPct}% used (${remaining}% left). GSD state is in STATE.md. Inform user to run /gsd-pause-work.` : `\u{1F534} CONTEXT CRITICAL: ${usedPct}% used (${remaining}% left). Inform user context is nearly exhausted.`;
      } else {
        msg = isGsdActive ? `\u26A0\uFE0F CONTEXT WARNING: ${usedPct}% used (${remaining}% left). Avoid starting new complex work.` : `\u26A0\uFE0F CONTEXT WARNING: ${usedPct}% used (${remaining}% left). Context is getting limited.`;
      }
      ctx.ui.notify(msg, isCritical ? "error" : "info");
    } catch {
    }
    return void 0;
  });
}
module.exports = module.exports.default ?? module.exports;
