import css from "./table.css?inline";
import type { SparqlResults } from "../sparql-results";
import type {
  Binding,
  BindingValue,
  BlankNodeValue,
  LiteralValue,
  SPARQLResults,
  TableRenderConfig,
  URIValue,
} from "../types";

const sheet = new CSSStyleSheet();
sheet.replaceSync(css);

export const tableRenderer = { sheet, render, appendRows, clear };

/**
 * Per-element render state, kept private to this module. It survives between
 * the initial `render` and later `appendRows` calls so appends can continue the
 * row numbering and re-use the column order without rebuilding the table.
 */
interface TableState {
  table: HTMLTableElement;
  vars: string[];
  /** 1-based number of the next row to render. */
  index: number;
  /** Sentinel + observer driving infinite scroll; absent when not paginated. */
  sentinel?: HTMLElement;
  observer?: IntersectionObserver;
}

const states = new WeakMap<SparqlResults, TableState>();

function render(
  el: SparqlResults,
  result: SPARQLResults,
  config?: TableRenderConfig,
) {
  // Tear down any observer from a previous render so it does not keep firing
  // against a detached sentinel.
  states.get(el)?.observer?.disconnect();

  const result_container = el.shadowRoot!.getElementById(
    "result",
  ) as HTMLTableElement;
  result_container.innerHTML = "";
  const tableWrapper = document.createElement("div");
  tableWrapper.classList.add("table-wrapper");
  if (config?.paginated) tableWrapper.classList.add("paginated");
  const table = document.createElement("table");
  tableWrapper.appendChild(table);

  // NOTE: Use document fragment to batch DOM updates.

  const headerRow = document.createElement("tr");
  const thIndex = document.createElement("th");
  thIndex.textContent = "#";
  headerRow.appendChild(thIndex);

  for (let selectedVar of result.head.vars) {
    const th = document.createElement("th");
    th.style.setProperty("text-align", "left");
    th.textContent = selectedVar;
    headerRow.appendChild(th);
  }

  table.appendChild(headerRow);

  const state: TableState = { table, vars: result.head.vars, index: 1 };
  states.set(el, state);

  appendBindings(el, state, result.results.bindings);
  result_container.appendChild(tableWrapper);

  if (config?.paginated) {
    // A zero-height sentinel just below the rows; when it scrolls into view we
    // ask the host for the next page via a `load-more` event.
    const sentinel = document.createElement("div");
    sentinel.className = "table-sentinel";
    tableWrapper.appendChild(sentinel);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        // Stop observing until the host responds; appendRows re-arms us. This
        // prevents a burst of duplicate events while a fetch is in flight.
        observer.unobserve(sentinel);
        el.dispatchEvent(
          new CustomEvent("load-more", {
            bubbles: true,
            composed: true,
            detail: { offset: state.index - 1 },
          }),
        );
      },
      { root: tableWrapper, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    state.sentinel = sentinel;
    state.observer = observer;
  }
}

/**
 * Append the next page of bindings to a previously rendered table. An empty
 * array means there is nothing left to load and tears down the observer.
 */
function appendRows(el: SparqlResults, bindings: Binding[]) {
  const state = states.get(el);
  if (!state) return;

  if (bindings.length === 0) {
    state.observer?.disconnect();
    state.observer = undefined;
    return;
  }

  appendBindings(el, state, bindings);

  // Re-arm the observer now that new rows (and a shifted sentinel) are in place.
  if (state.observer && state.sentinel) {
    state.observer.observe(state.sentinel);
  }
}

/**
 * Tear down any table render state for `el`: disconnect the pagination
 * observer and drop the stored state. Safe to call when nothing was rendered.
 */
function clear(el: SparqlResults) {
  const state = states.get(el);
  if (!state) return;
  state.observer?.disconnect();
  states.delete(el);
}

/** Render `bindings` as rows, advancing the running row index in `state`. */
function appendBindings(
  el: SparqlResults,
  state: TableState,
  bindings: Binding[],
) {
  const fragment = document.createDocumentFragment();
  for (const binding of bindings) {
    const tr = document.createElement("tr");
    tr.classList =
      "dark:even:bg-[#1F1F26] not-dark:odd:bg-neutral-50 border-b border-b-gray-300 dark:border-b-gray-600";
    const td = document.createElement("td");
    td.textContent = `${state.index}`;
    td.className = "p-2 text-neutral-400";
    tr.appendChild(td);
    for (const variable of state.vars) {
      const element = renderValue(el, binding[variable]);
      tr.appendChild(element);
    }
    fragment.appendChild(tr);
    state.index++;
  }
  state.table.appendChild(fragment);
}

function renderValue(
  el: SparqlResults,
  value: BindingValue | undefined,
): HTMLTableCellElement {
  if (value != undefined) {
    switch (value.type) {
      case "uri":
        return renderUri(el, value);
      case "literal":
        return renderLiteral(el, value);
      case "bnode":
        return renderBlankNode(value);
    }
  }
  return document.createElement("td");
}

function renderBlankNode(value: BlankNodeValue): HTMLTableCellElement {
  const td = document.createElement("td") as HTMLTableCellElement;
  const span = document.createElement("span") as HTMLSpanElement;
  span.textContent = `_:${value.value}`;
  copyOnClick(span, value.value);
  td.appendChild(span);
  return td;
}

function renderLiteral(
  el: SparqlResults,
  value: LiteralValue,
): HTMLTableCellElement {
  const td = document.createElement("td") as HTMLTableCellElement;
  const span = document.createElement("span") as HTMLSpanElement;
  copyOnClick(span, value.value);
  td.appendChild(span);
  if (
    value.datatype === "http://www.w3.org/2001/XMLSchema#decimal" &&
    isNumericString(value.value)
  ) {
    span.textContent = parseFloat(value.value).toLocaleString("en-US");
  } else {
    span.textContent =
      value.value.length > 200
        ? value.value.substring(0, 200) + "..."
        : value.value;
  }
  span.title = td.textContent;

  if (value["xml:lang"]) {
    const langSpan = document.createElement("span");
    langSpan.textContent = ` @${value["xml:lang"]}`;
    langSpan.className = "lang-tag text-gray-500 dark:text-gray-400 text-sm";
    if (!el.settings.langAnnotations) {
      langSpan.style.setProperty("display", "none");
    }
    span.appendChild(langSpan);
  }
  if (value.datatype) {
    const datatypeSpan = document.createElement("span");
    datatypeSpan.textContent = ` (${getShortDatatype(value.datatype!)})`;
    datatypeSpan.className =
      "type-tag text-gray-500 dark:text-gray-400 text-sm";
    if (!el.settings.typeAnnotations) {
      datatypeSpan.style.setProperty("display", "none");
    }
    span.appendChild(datatypeSpan);
  }
  return td;
}

function renderUri(el: SparqlResults, value: URIValue): HTMLTableCellElement {
  const td = document.createElement("td") as HTMLTableCellElement;
  td.title = value.value;
  if (el.settings.loadImages && isImageUrl(value.value)) {
    const img = document.createElement("img");
    img.src = value.value;
    img.alt = value.value;
    td.appendChild(img);
  } else {
    const link = document.createElement("a");
    link.href = value.value;
    link.title = value.value;
    link.className = "text-blue-600 dark:text-blue-400 hover:underline";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    if (value.curie) {
      link.textContent = value.curie;
    } else {
      const shortLabel = extractIriLabel(value.value);
      const shortSpan = document.createElement("span");
      shortSpan.className = "iri-short";
      shortSpan.textContent = shortLabel;
      if (!el.settings.shortenIris) {
        shortSpan.style.setProperty("display", "none");
      }

      const fullSpan = document.createElement("span");
      fullSpan.className = "iri-full";
      fullSpan.textContent = value.value;
      if (el.settings.shortenIris) {
        fullSpan.style.setProperty("display", "none");
      }

      link.appendChild(shortSpan);
      link.appendChild(fullSpan);
    }
    td.appendChild(link);
  }
  return td;
}

function copyOnClick(el: HTMLSpanElement, value: string) {
  el.onclick = () => {
    navigator.clipboard.writeText(value);
    document.dispatchEvent(
      new CustomEvent("toast", {
        detail: {
          type: "success",
          message: "Copied to clipboard!",
          duration: 3000,
        },
      }),
    );
  };
}

function getShortDatatype(datatype: string): string {
  const xsdPrefix = "http://www.w3.org/2001/XMLSchema#";
  if (datatype.startsWith(xsdPrefix)) {
    return "xsd:" + datatype.slice(xsdPrefix.length);
  }
  const match = datatype.match(/[#/]([^#/]+)$/);
  return match ? match[1] : datatype;
}

function isNumericString(str: string): boolean {
  return !isNaN(Number(str)) && !isNaN(parseFloat(str));
}

function extractIriLabel(iri: string): string {
  try {
    const url = new URL(iri);

    // Priority 1: Fragment
    if (url.hash && url.hash.length > 1) {
      return url.hash.slice(1);
    }

    // Priority 2 & 3: Last non-empty path segment (handles trailing slashes)
    const pathSegments = url.pathname
      .split("/")
      .filter((segment) => segment.length > 0);
    if (pathSegments.length > 0) {
      return pathSegments[pathSegments.length - 1];
    }

    // Priority 5: Fallback to domain only
    return url.hostname;
  } catch {
    // Fallback for malformed URLs: return original
    return iri;
  }
}

const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "tiff",
];
function isImageUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const ext = pathname.split(".").pop()?.toLowerCase();
    return ext !== undefined && IMAGE_EXTENSIONS.includes(ext);
  } catch {
    return false;
  }
}
