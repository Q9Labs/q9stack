import * as ContractErrors from "@__APP_SLUG__/contracts";
import type * as DatabaseErrors from "@__APP_SLUG__/database";
import { Schema } from "effect";

export type DatabaseError = DatabaseErrors.SampleRepoInfrastructureError;

export class DatabaseBoundaryError extends Error {
  override readonly cause: DatabaseError;

  constructor(cause: DatabaseError) {
    super("The sample repository failed outside the HTTP error contract");
    this.name = "DatabaseBoundaryError";
    this.cause = cause;
  }
}

export const toDatabaseBoundaryError = (error: DatabaseError): DatabaseBoundaryError =>
  new DatabaseBoundaryError(error);

const decodeNotFound = Schema.decodeUnknownSync(ContractErrors.NotFound);
const decodeConflictingTransition = Schema.decodeUnknownSync(ContractErrors.ConflictingTransition);

export const toNotFoundError = (error: DatabaseErrors.NotFound) => decodeNotFound(error);

export const toConflictingTransitionError = (error: DatabaseErrors.ConflictingTransition) =>
  decodeConflictingTransition(error);
