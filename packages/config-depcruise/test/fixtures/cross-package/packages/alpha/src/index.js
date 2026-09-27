import { sharedValue } from "../../beta/src/value.js";
import { localValue } from "./local.js";

export const combinedValue = `${localValue}:${sharedValue}`;
