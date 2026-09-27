import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { OpenApi } from "@effect/platform";

import { AppApi } from "./api.js";

const outputPath = fileURLToPath(new URL("../openapi.json", import.meta.url));
const openApi = OpenApi.fromApi(AppApi);

writeFileSync(outputPath, `${JSON.stringify(openApi, null, 2)}\n`, "utf8");
