export type RenderConfig =
  | TableRenderConfig
  | LinePlotRenderConfig
  | PetrimapsRenderConfig;

/** A demo/test fixture: a result set bundled with the ways to render it. */
export interface Fixture {
  data: SPARQLResults;
  configs: RenderConfig[];
}

export interface TableRenderConfig {
  type: "table";
  /**
   * Opt in to infinite scrolling. When set, the table emits a `load-more`
   * CustomEvent as the user scrolls near the bottom; respond by fetching the
   * next page and feeding it back via `SparqlResults.append_results`.
   */
  paginated?: boolean;
}

export interface LinePlotRenderConfig {
  type: "lineplot";
  /** Variable used for the x-axis. */
  x: string;
  /** One or more variables rendered as individual lines. */
  y: string[];
  /** Optional axis labels; defaults to the variable names. */
  xLabel?: string;
  yLabel?: string;
}

/** Rendering style of a petrimaps layer. */
export type PetrimapsStyle = "auto" | "objects" | "heatmap" | "raster";

/**
 * Map rendering via qlever-petrimaps. Mirrors the per-query config of the
 * petrimaps `/query?cfg=` endpoint: one entry in `layers` per rendered layer.
 */
export interface PetrimapsRenderConfig {
  type: "petrimaps";
  layers: PetrimapsLayer[];
}

/** One rendered layer; the keys match petrimaps' layer objects. */
export interface PetrimapsLayer {
  /** Query variable (without `?`) holding the WKT geometry. */
  geomfield: string;
  /** Stable layer id; petrimaps auto-generates one if omitted. */
  id?: string;
  /** Human-readable layer name shown in the UI; defaults to `geomfield`. */
  name?: string;
  /** Query variable holding a numeric value used to weight/color objects. */
  weightfield?: string;
  /** Query variable holding the raster-metadata subject. */
  rasterfield?: string;
  /** Query variable used to toggle/group objects in the UI. */
  toggle?: string;
  /** Raster cell width in web-mercator pseudometers (petrimaps default: 10). */
  rasterw?: number;
  /** Raster cell height in web-mercator pseudometers (petrimaps default: 10). */
  rasterh?: number;
  /** Object color as 6-digit hex without `#` (petrimaps default: "3388ff"). */
  color?: string;
  /** Heatmap/raster color scheme (petrimaps default: "spectralexp"). */
  colorscheme?: string;
  /** Rendering style (petrimaps default: "auto"). */
  style?: PetrimapsStyle;
  /**
   * Pixel radius of a point in the objects style, 0–50 (petrimaps default: 1,
   * i.e. a 3×3 pixel square).
   */
  pointsize?: number;
}

export interface SPARQLResults {
  head: SPARQLHead;
  results: SPARQLBindings;
}

export interface SPARQLHead {
  vars: string[];
  prefixes?: PrefixMap;
  link?: string[];
}

export interface PrefixMap {
  [prefix: string]: string;
}

export interface SPARQLBindings {
  bindings: Binding[];
}

export interface Binding {
  [variable: string]: BindingValue;
}

export type BindingValue =
  | URIValue
  | LiteralValue
  | BlankNodeValue
  | TripleValue;

export interface URIValue {
  type: "uri";
  value: string;
  curie?: string;
}

export interface LiteralValue {
  type: "literal";
  value: string;
  "xml:lang"?: string;
  datatype?: string;
}

export interface BlankNodeValue {
  type: "bnode";
  value: string;
}

// SPARQL-star support
export interface TripleValue {
  type: "triple";
  value: {
    subject: BindingValue;
    predicate: BindingValue;
    object: BindingValue;
  };
}

// Helper type for type guards
export function isURIValue(value: BindingValue): value is URIValue {
  return value.type === "uri";
}

export function isLiteralValue(value: BindingValue): value is LiteralValue {
  return value.type === "literal";
}

export function isBlankNodeValue(value: BindingValue): value is BlankNodeValue {
  return value.type === "bnode";
}

export function isTripleValue(value: BindingValue): value is TripleValue {
  return value.type === "triple";
}
