"use client";

import { createContext, use } from "react";

import { DEFAULT_ENVIRONMENT, type PreviewEnvironment } from "./environment";

const PreviewEnvironmentContext = createContext<PreviewEnvironment>(DEFAULT_ENVIRONMENT);

export const PreviewEnvironmentProvider = PreviewEnvironmentContext;

/** Lets a scenario react to the Tweaker's locale, role and direction. */
export function usePreviewEnvironment(): PreviewEnvironment {
  return use(PreviewEnvironmentContext);
}
