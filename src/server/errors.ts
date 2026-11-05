import { log } from "./log";

/**
 * Business errors raised by the data and service layers. Pages and actions translate
 * them into French messages; the raw database detail never reaches the browser.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(message: string, status: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.status = status;
  }
}

/** The user is authenticated but not allowed (RLS, 42501, explicit refusal). */
export class ForbiddenError extends AppError {
  constructor(
    message = "Vous n'avez pas le droit d'effectuer cette action.",
    options?: { cause?: unknown },
  ) {
    super(message, 403, options);
  }
}

/** No current user. */
export class UnauthenticatedError extends AppError {
  constructor(message = "Connexion requise.") {
    super(message, 401);
  }
}

/** Unique or primary key violation (23505). */
export class ConflictError extends AppError {
  constructor(message = "Cette valeur existe déjà.", options?: { cause?: unknown }) {
    super(message, 409, options);
  }
}

/** Check constraint, bad input syntax, not-null or foreign key violation. */
export class ValidationError extends AppError {
  constructor(message = "Les données saisies sont invalides.", options?: { cause?: unknown }) {
    super(message, 422, options);
  }
}

/** The requested row does not exist (or is not visible to the user). */
export class NotFoundError extends AppError {
  constructor(message = "Élément introuvable.", options?: { cause?: unknown }) {
    super(message, 404, options);
  }
}

/** Anything else: the detail goes to the server logs, the user gets a generic message. */
export class UnexpectedError extends AppError {
  constructor(
    message = "Une erreur inattendue s'est produite. Réessayez dans un instant.",
    options?: { cause?: unknown },
  ) {
    super(message, 500, options);
  }
}

interface PgErrorLike {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
}

function isPgErrorLike(error: unknown): error is PgErrorLike {
  return typeof error === "object" && error !== null && "code" in error;
}

/** PostgreSQL SQLSTATE codes mapped to business errors. */
const PG_CODE_MAP: Record<string, (error: PgErrorLike) => AppError> = {
  "42501": (e) => new ForbiddenError(undefined, { cause: e }),
  "23505": (e) => new ConflictError(undefined, { cause: e }),
  "23514": (e) => new ValidationError(undefined, { cause: e }),
  "22P02": (e) => new ValidationError(undefined, { cause: e }),
  "22001": (e) => new ValidationError("Texte trop long.", { cause: e }),
  "23502": (e) => new ValidationError("Un champ obligatoire est manquant.", { cause: e }),
  "23503": (e) => new ValidationError("Référence invalide.", { cause: e }),
};

/**
 * Translates a PostgreSQL error (or any error) into a business error. Business errors pass
 * through unchanged. Unknown errors become `UnexpectedError` and are logged server-side.
 */
export function translateError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isPgErrorLike(error) && error.code) {
    const factory = PG_CODE_MAP[error.code];
    if (factory) return factory(error);
  }
  log.error("unexpected_error", { error });
  return new UnexpectedError(undefined, { cause: error });
}

/** Message safe to show to the user for any thrown value. */
export function userMessage(error: unknown): string {
  return translateError(error).message;
}
