/** PostgREST / Postgres signals that a table is missing or not yet in the schema cache. */
export function isPostgrestTableMissing(
  error: { code?: string; message?: string } | null | undefined,
  tableName: string,
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const table = tableName.toLowerCase();
  if (error.code === "PGRST205") {
    return msg.includes(table) || msg.includes("schema cache");
  }
  return (
    msg.includes(table) &&
    (msg.includes("relation") ||
      msg.includes("schema cache") ||
      msg.includes("does not exist"))
  );
}

/** Column missing on an existing table (migration not applied / schema drift). */
export function isPostgrestColumnMissing(
  error: { code?: string; message?: string } | null | undefined,
  tableName: string,
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const table = tableName.toLowerCase();
  return (
    msg.includes(table) &&
    msg.includes("column") &&
    msg.includes("does not exist")
  );
}

export function isPostgrestSchemaUnavailable(
  error: { code?: string; message?: string } | null | undefined,
  tableName: string,
): boolean {
  return (
    isPostgrestTableMissing(error, tableName) ||
    isPostgrestColumnMissing(error, tableName)
  );
}
