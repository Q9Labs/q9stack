import type {
  ArchivedSample,
  DraftSample,
  PublishedSample,
  SampleEntity,
  SampleEntityKind,
} from "./model.js";
import { createArchivedSample, createPublishedSample } from "./model.js";

export const SAMPLE_COMMAND_KINDS = ["publish", "archive", "restore"] as const;
export type SampleCommandKind = (typeof SAMPLE_COMMAND_KINDS)[number];

export type SampleCommand =
  | { readonly kind: "publish"; readonly publishedAt: string }
  | { readonly kind: "archive"; readonly archivedAt: string }
  | { readonly kind: "restore" };

export interface InvalidSampleTransition {
  readonly kind: "invalid-transition";
  readonly from: SampleEntityKind;
  readonly command: SampleCommandKind;
}

export type SampleTransitionError = InvalidSampleTransition;

export type SampleTransitionResult =
  | { readonly ok: true; readonly entity: SampleEntity }
  | { readonly ok: false; readonly error: SampleTransitionError };

const invalidTransition = (
  entity: SampleEntity,
  command: SampleCommand,
): { readonly ok: false; readonly error: InvalidSampleTransition } => ({
  error: {
    command: command.kind,
    from: entity.kind,
    kind: "invalid-transition",
  },
  ok: false,
});

const publish = (
  entity: DraftSample,
  command: Extract<SampleCommand, { kind: "publish" }>,
): PublishedSample => createPublishedSample(entity.id, entity.title, command.publishedAt);

const archive = (
  entity: PublishedSample,
  command: Extract<SampleCommand, { kind: "archive" }>,
): ArchivedSample => createArchivedSample(entity.id, entity.title, command.archivedAt);

const restore = (entity: ArchivedSample): DraftSample => ({
  id: entity.id,
  kind: "draft",
  title: entity.title,
});

export const transitionSample = (
  entity: SampleEntity,
  command: SampleCommand,
): SampleTransitionResult => {
  switch (entity.kind) {
    case "draft":
      return command.kind === "publish"
        ? { entity: publish(entity, command), ok: true }
        : invalidTransition(entity, command);
    case "published":
      return command.kind === "archive"
        ? { entity: archive(entity, command), ok: true }
        : invalidTransition(entity, command);
    case "archived":
      return command.kind === "restore"
        ? { entity: restore(entity), ok: true }
        : invalidTransition(entity, command);
    default: {
      const unsupportedEntity: never = entity;
      throw new Error(`Unsupported sample entity: ${String(unsupportedEntity)}`);
    }
  }
};
