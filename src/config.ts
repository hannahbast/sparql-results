import { parse } from "yaml";
import type {
  LinePlotRenderConfig,
  PetrimapsLayer,
  PetrimapsRenderConfig,
  PetrimapsStyle,
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
 * The query may carry a plot config as YAML frontmatter in `#+` comments, e.g.
 *
 * ```sparql
 * #+ result-plot:
 * #+   type: petrimaps
 * #+   layers:
 * #+     - geomfield: geometry
 * #+       weightfield: population
 * #+       style: heatmap
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

  let doc: unknown;
  try {
    doc = parse(lines.join("\n"));
  } catch (e) {
    return err(`invalid YAML in config comment: ${(e as Error).message}`);
  }

  // Frontmatter comments exist, but none open a plot config: fall back to table.
  if (!isMapping(doc) || !("result-plot" in doc)) {
    return { ok: true, config: { type: "table" } };
  }

  const raw = doc["result-plot"];
  if (!isMapping(raw)) {
    return err('"result-plot" must be a mapping of config fields');
  }

  return validate(raw);
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

/** A parsed YAML mapping with string keys. */
type RawMapping = Record<string, unknown>;

function isMapping(value: unknown): value is RawMapping {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    case "petrimaps":
      return validatePetrimaps(raw);
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
  } else if (
    Array.isArray(raw.y) &&
    raw.y.length > 0 &&
    raw.y.every((item) => typeof item === "string")
  ) {
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
    if (typeof raw.paginated !== "boolean") {
      return err('"paginated" must be true or false');
    }
    config.paginated = raw.paginated;
  }

  return { ok: true, config };
}

const PETRIMAPS_STYLES: PetrimapsStyle[] = [
  "auto",
  "objects",
  "heatmap",
  "raster",
];

/** Color schemes accepted by petrimaps, each also available with an `exp` suffix. */
const PETRIMAPS_COLORSCHEMES = [
  "spectral",
  "RdYlGn",
  "RdYlBu",
  "RdGy",
  "YlOrRd",
  "Blues",
  "Greens",
  "Greys",
  "Oranges",
  "Reds",
].flatMap((scheme) => [scheme, `${scheme}exp`]);

function validatePetrimaps(raw: RawMapping): ExtractConfigResult {
  const unknown = rejectUnknownFields(raw, ["type", "layers"], "petrimaps");
  if (unknown) return err(unknown);

  if (!Array.isArray(raw.layers) || raw.layers.length === 0) {
    return err('petrimaps config requires "layers" to list at least one layer');
  }

  const layers: PetrimapsLayer[] = [];
  for (const [i, entry] of raw.layers.entries()) {
    const layer = validateLayer(entry);
    if (typeof layer === "string") return err(`layer ${i + 1}: ${layer}`);
    layers.push(layer);
  }

  const config: PetrimapsRenderConfig = { type: "petrimaps", layers };
  return { ok: true, config };
}

/** Validate one entry of `layers`; returns the layer or an error string. */
function validateLayer(entry: unknown): PetrimapsLayer | string {
  if (!isMapping(entry)) return "must be a mapping of layer fields";

  const unknown = rejectUnknownFields(
    entry,
    [
      "geomfield",
      "id",
      "name",
      "weightfield",
      "rasterfield",
      "toggle",
      "rasterw",
      "rasterh",
      "color",
      "colorscheme",
      "style",
      "pointsize",
    ],
    "layer",
  );
  if (unknown) return unknown;

  if (typeof entry.geomfield !== "string" || entry.geomfield === "") {
    return '"geomfield" must be a variable name';
  }

  const layer: PetrimapsLayer = { geomfield: entry.geomfield };

  for (const field of [
    "id",
    "name",
    "weightfield",
    "rasterfield",
    "toggle",
  ] as const) {
    const value = entry[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || value === "") {
      return `"${field}" must be a non-empty string`;
    }
    layer[field] = value;
  }

  for (const field of ["rasterw", "rasterh"] as const) {
    const value = entry[field];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return `"${field}" must be a positive integer`;
    }
    layer[field] = value;
  }

  if (entry.color !== undefined) {
    // All-digit hex colors parse as YAML numbers; require quoting instead.
    if (
      typeof entry.color !== "string" ||
      !/^[0-9a-fA-F]{6}$/.test(entry.color)
    ) {
      return '"color" must be a 6-digit hex string without "#" (quote it, e.g. "3388ff")';
    }
    layer.color = entry.color;
  }

  if (entry.colorscheme !== undefined) {
    if (
      typeof entry.colorscheme !== "string" ||
      !PETRIMAPS_COLORSCHEMES.includes(entry.colorscheme)
    ) {
      return `unknown colorscheme "${entry.colorscheme}"`;
    }
    layer.colorscheme = entry.colorscheme;
  }

  if (entry.style !== undefined) {
    const style = PETRIMAPS_STYLES.find((s) => s === entry.style);
    if (style === undefined) return `unknown style "${entry.style}"`;
    layer.style = style;
  }

  if (entry.pointsize !== undefined) {
    const value = entry.pointsize;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 50
    ) {
      return '"pointsize" must be an integer between 0 and 50';
    }
    layer.pointsize = value;
  }

  return layer;
}
