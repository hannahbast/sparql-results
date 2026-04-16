import "./sparql-results.ts";
import type { SparqlResults } from "./sparql-results.ts";
import type { TableRenderConfig } from "./types.ts";

const fixtures = import.meta.glob("../fixtures/*.json", {
  eager: true,
  import: "default",
}) as Record<string, any>;

const element = document.querySelector<SparqlResults>("sparql-results")!;
const select = document.querySelector<HTMLSelectElement>("#fixture-select")!;

for (const path of Object.keys(fixtures).sort()) {
  const name = path.split("/").pop()!.replace(".json", "");
  select.add(new Option(name, path));
}

const tableConfig: TableRenderConfig = {
  type: "table",
};

const render = () =>
  element.render_results(fixtures[select.value], tableConfig);
select.addEventListener("change", render);
render();
