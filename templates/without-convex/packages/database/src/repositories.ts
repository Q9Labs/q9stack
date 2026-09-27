import {
  SampleEntitySchema,
  transitionSample,
  type SampleCommand,
  type SampleCommandKind,
  type SampleEntity,
  type SampleEntityKind,
  type SampleId,
} from "@__APP_SLUG__/core";
import { SqlClient, type SqlError } from "@effect/sql";
import { Context, Data, Effect, Layer, Schema } from "effect";

export type SampleRepoInfrastructureError = SqlError.SqlError | RowDecodeError;
export type SampleRepoError = SampleRepoInfrastructureError | NotFound | ConflictingTransition;

export class NotFound extends Data.TaggedError("NotFound")<{
  readonly id: SampleId;
}> {}

export class ConflictingTransition extends Data.TaggedError("ConflictingTransition")<{
  readonly id: SampleId;
  readonly from: SampleEntityKind;
  readonly command: SampleCommandKind;
}> {}

export class RowDecodeError extends Data.TaggedError("SampleRowDecodeError")<{
  readonly id: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export interface SampleRepository {
  readonly insert: (
    entity: SampleEntity,
  ) => Effect.Effect<SampleEntity, SampleRepoInfrastructureError>;
  readonly get: (
    id: SampleId,
  ) => Effect.Effect<SampleEntity, SampleRepoInfrastructureError | NotFound>;
  readonly list: () => Effect.Effect<ReadonlyArray<SampleEntity>, SampleRepoInfrastructureError>;
  readonly transition: (
    id: SampleId,
    command: SampleCommand,
  ) => Effect.Effect<
    SampleEntity,
    SampleRepoInfrastructureError | NotFound | ConflictingTransition
  >;
}

export class SampleRepo extends Context.Tag("@__APP_SLUG__/database/SampleRepo")<
  SampleRepo,
  SampleRepository
>() {}

interface SampleRow {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly published_at: Date | string | null;
  readonly archived_at: Date | string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface SamplePersistenceValues {
  readonly state: SampleEntityKind;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
}

const toTimestampString = (
  value: Date | string | null,
  id: string,
  field: string,
): Effect.Effect<string | null, RowDecodeError> => {
  if (value === null) return Effect.succeed(null);
  if (typeof value === "string") return Effect.succeed(value);
  if (Number.isNaN(value.getTime())) {
    return Effect.fail(new RowDecodeError({ id, reason: `invalid ${field}` }));
  }
  return Effect.succeed(value.toISOString());
};

const decodeEntity = (input: unknown, id: string) =>
  Schema.decodeUnknown(SampleEntitySchema)(input).pipe(
    Effect.mapError((cause) => new RowDecodeError({ id, reason: "sample entity schema", cause })),
  );

/** Converts one SQL row into the provider-free core union. */
export const decodeSampleRow = (row: SampleRow): Effect.Effect<SampleEntity, RowDecodeError> =>
  Effect.gen(function* () {
    const publishedAt = yield* toTimestampString(row.published_at, row.id, "published_at");
    const archivedAt = yield* toTimestampString(row.archived_at, row.id, "archived_at");

    switch (row.state) {
      case "draft":
        if (publishedAt !== null || archivedAt !== null) {
          return yield* Effect.fail(
            new RowDecodeError({ id: row.id, reason: "draft has lifecycle timestamp" }),
          );
        }
        return yield* decodeEntity({ id: row.id, kind: "draft", title: row.title }, row.id);
      case "published":
        if (publishedAt === null || archivedAt !== null) {
          return yield* Effect.fail(
            new RowDecodeError({ id: row.id, reason: "published lifecycle timestamp mismatch" }),
          );
        }
        return yield* decodeEntity(
          { id: row.id, kind: "published", publishedAt, title: row.title },
          row.id,
        );
      case "archived":
        if (publishedAt !== null || archivedAt === null) {
          return yield* Effect.fail(
            new RowDecodeError({ id: row.id, reason: "archived lifecycle timestamp mismatch" }),
          );
        }
        return yield* decodeEntity(
          { archivedAt, id: row.id, kind: "archived", title: row.title },
          row.id,
        );
      default:
        return yield* Effect.fail(
          new RowDecodeError({ id: row.id, reason: `unknown sample state: ${row.state}` }),
        );
    }
  });

const valuesFor = (entity: SampleEntity): SamplePersistenceValues => {
  switch (entity.kind) {
    case "draft":
      return { archivedAt: null, publishedAt: null, state: "draft" };
    case "published":
      return {
        archivedAt: null,
        publishedAt: entity.publishedAt,
        state: "published",
      };
    case "archived":
      return { archivedAt: entity.archivedAt, publishedAt: null, state: "archived" };
    default: {
      const unsupportedEntity: never = entity;
      throw new Error(`Unsupported sample entity: ${String(unsupportedEntity)}`);
    }
  }
};

const decodeFirst = (operation: string, rows: ReadonlyArray<SampleRow>) => {
  const row = rows[0];
  if (row === undefined) {
    return Effect.fail(new RowDecodeError({ id: operation, reason: "statement returned no row" }));
  }
  return decodeSampleRow(row);
};

const insert = (sql: SqlClient.SqlClient, entity: SampleEntity) => {
  const values = valuesFor(entity);
  return sql<SampleRow>`INSERT INTO sample_entities
      (id, title, state, published_at, archived_at)
    VALUES (${entity.id}, ${entity.title}, ${values.state},
      ${values.publishedAt}, ${values.archivedAt})
    RETURNING id, title, state, published_at, archived_at, created_at, updated_at`.pipe(
    Effect.flatMap((rows) => decodeFirst("sample.insert", rows)),
  );
};

const get = (sql: SqlClient.SqlClient, id: SampleId) =>
  Effect.gen(function* () {
    const rows = yield* sql<SampleRow>`SELECT id, title, state, published_at,
        archived_at, created_at, updated_at
      FROM sample_entities WHERE id = ${id}`;
    const row = rows[0];
    if (row === undefined) return yield* Effect.fail(new NotFound({ id }));
    return yield* decodeSampleRow(row);
  });

const list = (sql: SqlClient.SqlClient) =>
  sql<SampleRow>`SELECT id, title, state, published_at, archived_at, created_at, updated_at
    FROM sample_entities ORDER BY created_at, id`.pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeSampleRow)),
  );

/** Applies a domain transition and turns an invalid one into a typed conflict. */
export const applySampleTransition = (
  id: SampleId,
  entity: SampleEntity,
  command: SampleCommand,
): Effect.Effect<SampleEntity, ConflictingTransition> => {
  const result = transitionSample(entity, command);
  if (result.ok) return Effect.succeed(result.entity);
  return Effect.fail(
    new ConflictingTransition({
      command: result.error.command,
      from: result.error.from,
      id,
    }),
  );
};

const transition = (sql: SqlClient.SqlClient, id: SampleId, command: SampleCommand) =>
  sql.withTransaction(
    Effect.gen(function* () {
      const rows = yield* sql<SampleRow>`SELECT id, title, state, published_at,
          archived_at, created_at, updated_at
        FROM sample_entities WHERE id = ${id} FOR UPDATE`;
      const row = rows[0];
      if (row === undefined) return yield* Effect.fail(new NotFound({ id }));

      const current = yield* decodeSampleRow(row);
      const next = yield* applySampleTransition(id, current, command);
      const values = valuesFor(next);
      const updated = yield* sql<SampleRow>`UPDATE sample_entities
          SET title = ${next.title}, state = ${values.state},
              published_at = ${values.publishedAt}, archived_at = ${values.archivedAt},
              updated_at = now()
        WHERE id = ${id}
        RETURNING id, title, state, published_at, archived_at, created_at, updated_at`;
      return yield* decodeFirst("sample.transition", updated);
    }),
  );

export const SampleRepoLive = Layer.effect(
  SampleRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return {
      get: (id: SampleId) => get(sql, id),
      insert: (entity: SampleEntity) => insert(sql, entity),
      list: () => list(sql),
      transition: (id: SampleId, command: SampleCommand) => transition(sql, id, command),
    };
  }),
);
