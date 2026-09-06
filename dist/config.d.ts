import { RenderConfig } from './types';
/**
 * Outcome of {@link extractConfig}: either a render config, or an error string
 * describing why the embedded plot config could not be understood.
 */
export type ExtractConfigResult = {
    ok: true;
    config: RenderConfig;
} | {
    ok: false;
    error: string;
};
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
export declare function extractConfig(query: string): ExtractConfigResult;
