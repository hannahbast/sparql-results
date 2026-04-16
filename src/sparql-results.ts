import { getDefaultSettings, type Settings } from "./settings";
import { tableRenderer } from "./table/table";
import type { RenderConfig, SPARQLResults } from "./types";
import css from "./style.css?inline";

const baseSheet = new CSSStyleSheet();
baseSheet.replaceSync(css);

export class SparqlResults extends HTMLElement {
  static observedAttributes = ["label"];

  public settings: Settings;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [baseSheet, tableRenderer.sheet];
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
        tableRenderer.render(this, result);
        break;
      default:
        throw "Unknown config type " + config.type;
    }
  }
}

customElements.define("sparql-results", SparqlResults);

declare global {
  interface HTMLElementTagNameMap {
    "sparql-results": SparqlResults;
  }
}
