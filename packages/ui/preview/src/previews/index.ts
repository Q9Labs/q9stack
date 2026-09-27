import type { Preview } from "../../../src/preview/index";
import { actionsPreview } from "./actions";
import { authPreview } from "./auth";
import { dataPreview } from "./data";
import { formsPreview } from "./forms";
import { overlaysPreview } from "./overlays";
import { shellPreview } from "./shell";

export const previews: readonly Preview[] = [
  actionsPreview,
  formsPreview,
  dataPreview,
  overlaysPreview,
  shellPreview,
  authPreview,
];
