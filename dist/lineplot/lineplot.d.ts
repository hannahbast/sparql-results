import { SparqlResults } from '../sparql-results';
import { LinePlotRenderConfig, SPARQLResults } from '../types';
export declare const linePlotRenderer: {
    sheet: CSSStyleSheet;
    render: typeof render;
    clear: typeof clear;
};
/**
 * Tear down any lineplot render state for `el`: disconnect the resize observer
 * and drop it. Safe to call when nothing was rendered.
 */
declare function clear(el: SparqlResults): void;
declare function render(el: SparqlResults, result: SPARQLResults, config: LinePlotRenderConfig): void;
export {};
