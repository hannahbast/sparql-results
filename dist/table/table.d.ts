import { SparqlResults } from '../sparql-results';
import { Binding, SPARQLResults, TableRenderConfig } from '../types';
export declare const tableRenderer: {
    sheet: CSSStyleSheet;
    render: typeof render;
    appendRows: typeof appendRows;
    clear: typeof clear;
};
declare function render(el: SparqlResults, result: SPARQLResults, config?: TableRenderConfig): void;
/**
 * Append the next page of bindings to a previously rendered table. An empty
 * array means there is nothing left to load and tears down the observer.
 */
declare function appendRows(el: SparqlResults, bindings: Binding[]): void;
/**
 * Tear down any table render state for `el`: disconnect the pagination
 * observer and drop the stored state. Safe to call when nothing was rendered.
 */
declare function clear(el: SparqlResults): void;
export {};
