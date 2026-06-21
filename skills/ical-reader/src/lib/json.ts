export type OkResponse<T> = { ok: true } & T;
export type ErrorResponse = {
  ok: false;
  errorType: string;
  message: string;
  details?: Record<string, unknown>;
};

export function ok<T>(data: T): OkResponse<T> {
  return { ok: true, ...data } as OkResponse<T>;
}

export function error(
  errorType: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorResponse {
  return { ok: false, errorType, message, ...(details ? { details } : {}) };
}

export function printJson(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

export function printErrorAndExit(
  errorType: string,
  message: string,
  details?: Record<string, unknown>,
  exitCode = 1,
): never {
  printJson(error(errorType, message, details));
  process.exit(exitCode);
}
