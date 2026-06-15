import { linePlotRenderer } from "./lineplot/lineplot";
import { getDefaultSettings, type Settings } from "./settings";
import { tableRenderer } from "./table/table";
import type { Binding, RenderConfig, SPARQLResults } from "./types";
import css from "./style.css?inline";

export { extractConfig, type ExtractConfigResult } from "./config";
export type { Settings } from "./settings";
export type * from "./types";

const baseSheet = new CSSStyleSheet();
baseSheet.replaceSync(css);

export class SparqlResults extends HTMLElement {
  static observedAttributes = [];

  public settings: Settings;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [
      baseSheet,
      tableRenderer.sheet,
      linePlotRenderer.sheet,
    ];
    this.settings = getDefaultSettings();
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(
    _name: string,
    _old: string | null,
    _new: string | null,
  ) {
    if (this.isConnected) this.render();
  }

  private render() {
    this.shadowRoot!.innerHTML = `
      <div id="result" style="width: 100%"></div>
    `;
  }

  render_results(result: SPARQLResults, config: RenderConfig) {
    switch (config.type) {
      case "table":
        tableRenderer.render(this, result, config);
        break;
      case "lineplot":
        linePlotRenderer.render(this, result, config);
        break;
      default:
        throw `Unknown config type ${(config as RenderConfig).type}`;
    }
  }

  /**
   * Reset the component to its empty state: tear down any renderer observers
   * and clear the rendered output. Leaves `settings` untouched. Safe to call
   * whether or not anything has been rendered.
   */
  clear() {
    tableRenderer.clear(this);
    linePlotRenderer.clear(this);
    this.render();
  }

  /**
   * Append more rows to a table rendered with `paginated: true`. Pass the next
   * page of bindings; an empty array signals that all results have been loaded
   * and stops further `load-more` events. No-op for non-table renders.
   */
  append_results(bindings: Binding[]) {
    tableRenderer.appendRows(this, bindings);
  }
}

customElements.define("sparql-results", SparqlResults);

declare global {
  interface HTMLElementTagNameMap {
    "sparql-results": SparqlResults;
  }
}
