import css from "./table.css?inline";
import type { SparqlResults } from "../sparql-results";
import type {
  BindingValue,
  BlankNodeValue,
  LiteralValue,
  SPARQLResults,
  URIValue,
} from "../types";

const sheet = new CSSStyleSheet();
sheet.replaceSync(css);

export const tableRenderer = { sheet, render };

function render(el: SparqlResults, result: SPARQLResults) {
  const result_container = el.shadowRoot!.getElementById(
    "result",
  ) as HTMLTableElement;
  result_container.innerHTML = "";
  const tableWrapper = document.createElement("div");
  tableWrapper.classList.add("table-wrapper");
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

  const fragment = document.createDocumentFragment();
  let index = 1;
  for (const binding of result.results.bindings) {
    const tr = document.createElement("tr");
    tr.classList =
      "dark:even:bg-[#1F1F26] not-dark:odd:bg-neutral-50 border-b border-b-gray-300 dark:border-b-gray-600";
    const td = document.createElement("td");
    td.textContent = `${index}`;
    td.className = "p-2 text-neutral-400";
    tr.appendChild(td);
    for (const variable of result.head.vars) {
      const element = renderValue(el, binding[variable]);
      tr.appendChild(element);
    }
    fragment.appendChild(tr);
    index++;
  }

  table.appendChild(fragment);
  result_container.appendChild(tableWrapper);
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
