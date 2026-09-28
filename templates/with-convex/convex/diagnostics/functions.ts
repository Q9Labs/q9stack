import { createDiagnosticCode, safeStackFrameSchema } from "@q9labsai/diagnostics";
import { ConvexError } from "convex/values";

import { internal } from "../_generated/api.js";
import type { ActionCtx } from "../_generated/server.js";

interface FrameLocation {
  file: string;
  line: number;
  column?: number;
  function?: string;
}

function safeFrames(error: unknown): FrameLocation[] | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  const frames = error.stack
    .split("\n")
    .slice(1, 13)
    .flatMap((line) => {
      const match = /(?:at .*? \()?([^\s()]+):(\d+):(\d+)\)?$/.exec(line.trim());
      if (!match) return [];
      const frame = safeStackFrameSchema.safeParse({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
      });
      if (!frame.success) return [];
      const location: FrameLocation = { file: frame.data.file, line: frame.data.line };
      if (frame.data.column !== undefined) location.column = frame.data.column;
      if (frame.data.function !== undefined) location.function = frame.data.function;
      return [location];
    });
  return frames.length ? frames : undefined;
}

// Only unexpected defects cross this boundary. Expected ConvexError values keep their semantics.
export async function withInternalDiagnostics<T>(
  ctx: ActionCtx,
  functionName: string,
  operation: () => Promise<T>,
): Promise<T> {
  const identity = await ctx.auth.getUserIdentity();
  // The sample action is public; diagnostics must not change that contract.
  if (!identity) return await operation();
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    const traceId = createDiagnosticCode();
    const frames = safeFrames(error);
    console.error(`convex.function.failed trace_id=${traceId}`, { functionName, cause: error });
    try {
      await ctx.runMutation(internal.diagnostics.persist.persistFailure, {
        traceId,
        subjectId: identity.subject,
        functionName,
        occurredAt: Date.now(),
        ...(frames !== undefined && { safeStackFrames: frames }),
      });
    } catch (persistError) {
      console.error("convex.function.diagnostic_persist_failed", { traceId, cause: persistError });
      throw new ConvexError({ code: "INTERNAL" });
    }
    throw new ConvexError({ code: "INTERNAL", diagnosticCode: traceId });
  }
}
