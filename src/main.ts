import "./sparql-results.ts";
import type { SparqlResults } from "./sparql-results.ts";
import type { Fixture, RenderConfig } from "./types.ts";

const fixtures = import.meta.glob("../fixtures/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Fixture>;

const element = document.querySelector<SparqlResults>("sparql-results")!;
const select = document.querySelector<HTMLSelectElement>("#fixture-select")!;
const renderSelect =
  document.querySelector<HTMLSelectElement>("#render-select")!;

const STORAGE_FIXTURE = "sparql-results:fixture";
const STORAGE_CONFIG = "sparql-results:config";

for (const path of Object.keys(fixtures).sort()) {
  const name = path.split("/").pop()!.replace(".json", "");
  select.add(new Option(name, path));
}

/** Human-readable label for a render config in the dropdown. */
function configLabel(config: RenderConfig): string {
  switch (config.type) {
    case "lineplot":
      return `lineplot (${config.x} → ${config.y.join(", ")})`;
    default:
      return config.type;
  }
}

/** Rebuild the render dropdown from the selected fixture's configs. */
function populateRenderOptions() {
  const fixture = fixtures[select.value];
  renderSelect.replaceChildren();
  fixture.configs.forEach((config, i) => {
    renderSelect.add(new Option(configLabel(config), String(i)));
  });
}

/** Rows served per page when simulating a paginated data source. */
const PAGE_SIZE = 50;

/** The active `load-more` handler, removed before each (re)render. */
let loadMoreHandler: ((e: Event) => void) | null = null;

function render() {
  const fixture = fixtures[select.value];
  const config =
    fixture.configs[Number(renderSelect.value)] ?? fixture.configs[0];

  if (loadMoreHandler) {
    element.removeEventListener("load-more", loadMoreHandler);
    loadMoreHandler = null;
  }

  if (config.type === "table" && config.paginated) {
    // Simulate a paginated backend (e.g. SPARQL LIMIT/OFFSET) by slicing the
    // fixture's bindings: render the first page, then serve more on demand.
    const all = fixture.data.results.bindings;
    element.render_results(
      { ...fixture.data, results: { bindings: all.slice(0, PAGE_SIZE) } },
      config,
    );
    loadMoreHandler = (e: Event) => {
      const { offset } = (e as CustomEvent<{ offset: number }>).detail;
      // An empty slice (past the end) tells the component to stop asking.
      element.append_results(all.slice(offset, offset + PAGE_SIZE));
    };
    element.addEventListener("load-more", loadMoreHandler);
  } else {
    element.render_results(fixture.data, config);
  }
}

// Restore the previously selected fixture and render config (if still valid).
const savedFixture = localStorage.getItem(STORAGE_FIXTURE);
if (savedFixture && fixtures[savedFixture]) {
  select.value = savedFixture;
}
populateRenderOptions();
const savedConfig = localStorage.getItem(STORAGE_CONFIG);
if (
  savedConfig &&
  renderSelect.querySelector(`option[value="${savedConfig}"]`)
) {
  renderSelect.value = savedConfig;
}

select.addEventListener("change", () => {
  localStorage.setItem(STORAGE_FIXTURE, select.value);
  populateRenderOptions();
  localStorage.removeItem(STORAGE_CONFIG);
  render();
});
renderSelect.addEventListener("change", () => {
  localStorage.setItem(STORAGE_CONFIG, renderSelect.value);
  render();
});

render();
