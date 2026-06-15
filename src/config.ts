import type {
  LinePlotRenderConfig,
  RenderConfig,
  TableRenderConfig,
} from "./types";

/**
 * Outcome of {@link extractConfig}: either a render config, or an error string
 * describing why the embedded plot config could not be understood.
 */
export type ExtractConfigResult =
  | { ok: true; config: RenderConfig }
  | { ok: false; error: string };

/**
 * Derive a render config from a SPARQL query.
 *
 * The query may carry a plot config in a `#+` comment frontmatter, e.g.
 *
 * ```sparql
 * #+ result-plot:
 * #+   type: lineplot
 * #+   x: x
 * #+   y: [y, z]
 * #+   xLabel: dings
 * #+   yLabel: foo
 * ```
 *
 * Behaviour:
 * - valid `result-plot` frontmatter -> that config;
 * - present but malformed frontmatter -> `{ ok: false, error }`;
 * - no frontmatter -> a default `table` config.
 *
 * NOTE: this only validates the *shape* of the config. It does not check that
 * the referenced variables are actually selected by the query.
 */
export function extractConfig(query: string): ExtractConfigResult {
  const lines = extractFrontmatterLines(query);
  if (lines === null) return { ok: true, config: { type: "table" } };

  const rootIdx = lines.findIndex((l) => /^result-plot:/.test(l.trim()));
  // Frontmatter comments exist, but none open a plot config: fall back to table.
  if (rootIdx === -1) return { ok: true, config: { type: "table" } };

  const inline = lines[rootIdx].trim().slice("result-plot:".length).trim();
  if (inline !== "") {
    return err('"result-plot" must be a mapping of config fields');
  }

  const mapping = parseMapping(lines, rootIdx);
  if ("error" in mapping) return err(mapping.error);

  return validate(mapping.value);
}

/** A `#+` line, capturing everything after the prefix (one optional space). */
const FRONTMATTER_LINE = /^\s*#\+ ?(.*)$/;

/**
 * Pull the content of every `#+` comment line out of the query, preserving the
 * relative indentation that follows the prefix. Returns `null` when the query
 * carries no frontmatter at all.
 */
function extractFrontmatterLines(query: string): string[] | null {
  const out: string[] = [];
  for (const raw of query.split("\n")) {
    const match = raw.match(FRONTMATTER_LINE);
    if (match) out.push(match[1]);
  }
  return out.length > 0 ? out : null;
}

/** A scalar (`type: lineplot`) or a flow sequence (`y: [y, z]`). */
type RawValue = string | string[];
type RawMapping = Record<string, RawValue>;

/** Number of leading spaces on a line. */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Parse the indented `key: value` block beneath `result-plot:`. Strict: every
 * child must share one indentation level and match the supported line shape,
 * so anything outside this small subset surfaces as an error rather than being
 * silently misread.
 */
function parseMapping(
  lines: string[],
  rootIdx: number,
): { value: RawMapping } | { error: string } {
  const baseIndent = indentOf(lines[rootIdx]);
  const out: RawMapping = {};
  let childIndent: number | null = null;

  for (let i = rootIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    const indent = indentOf(line);
    if (indent <= baseIndent) break; // dedent ends the block

    if (childIndent === null) childIndent = indent;
    if (indent !== childIndent) {
      return { error: `unexpected indentation at "${line.trim()}"` };
    }

    const match = line.trim().match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!match) return { error: `invalid config line "${line.trim()}"` };

    const key = match[1];
    if (key in out) return { error: `duplicate field "${key}"` };
    out[key] = parseValue(match[2]);
  }

  return { value: out };
}

/** Parse a single value: a `[a, b]` flow sequence or a (possibly quoted) scalar. */
function parseValue(raw: string): RawValue {
  const value = raw.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((item) => unquote(item.trim()));
  }
  return unquote(value);
}

/** Strip a single pair of surrounding single or double quotes. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function err(error: string): ExtractConfigResult {
  return { ok: false, error };
}

/** Dispatch on `type` and validate the field shape for that renderer. */
function validate(raw: RawMapping): ExtractConfigResult {
  const type = raw.type;
  if (type === undefined) return err('result-plot config is missing "type"');
  if (typeof type !== "string") return err('"type" must be a string');

  switch (type) {
    case "lineplot":
      return validateLinePlot(raw);
    case "table":
      return validateTable(raw);
    default:
      return err(`unknown plot type "${type}"`);
  }
}

function rejectUnknownFields(
  raw: RawMapping,
  allowed: string[],
  kind: string,
): string | null {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key))
      return `unknown field "${key}" in ${kind} config`;
  }
  return null;
}

function validateLinePlot(raw: RawMapping): ExtractConfigResult {
  const unknown = rejectUnknownFields(
    raw,
    ["type", "x", "y", "xLabel", "yLabel"],
    "lineplot",
  );
  if (unknown) return err(unknown);

  if (typeof raw.x !== "string" || raw.x === "") {
    return err('lineplot config requires "x" to be a variable name');
  }

  let y: string[];
  if (typeof raw.y === "string" && raw.y !== "") {
    y = [raw.y];
  } else if (Array.isArray(raw.y) && raw.y.length > 0) {
    y = raw.y;
  } else {
    return err('lineplot config requires "y" to list at least one variable');
  }

  const config: LinePlotRenderConfig = { type: "lineplot", x: raw.x, y };

  for (const label of ["xLabel", "yLabel"] as const) {
    const value = raw[label];
    if (value === undefined) continue;
    if (typeof value !== "string") return err(`"${label}" must be a string`);
    config[label] = value;
  }

  return { ok: true, config };
}

function validateTable(raw: RawMapping): ExtractConfigResult {
  const unknown = rejectUnknownFields(raw, ["type", "paginated"], "table");
  if (unknown) return err(unknown);

  const config: TableRenderConfig = { type: "table" };

  if (raw.paginated !== undefined) {
    if (raw.paginated === "true") config.paginated = true;
    else if (raw.paginated === "false") config.paginated = false;
    else return err('"paginated" must be true or false');
  }

  return { ok: true, config };
}
