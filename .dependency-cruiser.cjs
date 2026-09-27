const { makeHexagonalRules, presets } = require("@q9labsai/config-depcruise");

// Template trees carry tokens and their own depcruise configs; each generated
// app gates them for real, so the repo-level cruise skips them.
module.exports = makeHexagonalRules({
  ...presets.monorepo,
  exclude: ["^templates/", "^packages/create-q9stack/templates/"],
});
