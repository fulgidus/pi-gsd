import { defineConfig } from "tsup";

export default defineConfig([
  // CLI binary
  {
    entry: { "pi-gsd-tools": "src/cli.ts" },
    format: ["cjs"],
    outDir: "dist",
    minify: true,
    splitting: false,
    clean: true,
    onSuccess: "chmod +x dist/pi-gsd-tools.js",
  },
  // Pi extension — WXP engine bundled inline, footer hoists default export
  {
    entry: { "pi-gsd-hooks": ".gsd/extensions/pi-gsd-hooks.ts" },
    format: ["cjs"],
    outDir: "dist",
    splitting: false,
    external: ["@mariozechner/pi-coding-agent"],
    footer: { js: "module.exports = module.exports.default ?? module.exports;" },
  },
]);
