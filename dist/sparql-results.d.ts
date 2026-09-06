import { Settings } from './settings';
import { Binding, RenderConfig, SPARQLResults } from './types';
export { extractConfig, type ExtractConfigResult } from './config';
export type { Settings } from './settings';
export type * from './types';
export declare class SparqlResults extends HTMLElement {
    static observedAttributes: never[];
    settings: Settings;
    constructor();
    connectedCallback(): void;
    attributeChangedCallback(_name: string, _old: string | null, _new: string | null): void;
    private render;
    render_results(result: SPARQLResults, config: RenderConfig): void;
    /**
     * Reset the component to its empty state: tear down any renderer observers
     * and clear the rendered output. Leaves `settings` untouched. Safe to call
     * whether or not anything has been rendered.
     */
    clear(): void;
    /**
     * Append more rows to a table rendered with `paginated: true`. Pass the next
     * page of bindings; an empty array signals that all results have been loaded
     * and stops further `load-more` events. No-op for non-table renders.
     */
    append_results(bindings: Binding[]): void;
}
declare global {
    interface HTMLElementTagNameMap {
        "sparql-results": SparqlResults;
    }
}
