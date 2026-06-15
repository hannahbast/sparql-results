import { bisector, extent, max, min } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { type ScalePoint, scaleLinear, scalePoint, scaleTime } from "d3-scale";
import { create, pointer, select } from "d3-selection";
import { curveMonotoneX, line as d3line } from "d3-shape";
import css from "./lineplot.css?inline";
import type { SparqlResults } from "../sparql-results";
import type {
  BindingValue,
  LinePlotRenderConfig,
  SPARQLResults,
} from "../types";

const sheet = new CSSStyleSheet();
sheet.replaceSync(css);

export const linePlotRenderer = { sheet, render, clear };

/** The active resize observer per result container, so a re-render can replace
 *  it instead of leaking observers. */
const observers = new WeakMap<HTMLElement, ResizeObserver>();

/**
 * Tear down any lineplot render state for `el`: disconnect the resize observer
 * and drop it. Safe to call when nothing was rendered.
 */
function clear(el: SparqlResults) {
  const container = el.shadowRoot!.getElementById("result");
  if (!container) return;
  observers.get(container)?.disconnect();
  observers.delete(container);
}

const PALETTE = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

interface Series {
  name: string;
  color: string;
  /** Points with a defined numeric y, in x order. */
  points: { x: number; xLabel: string; y: number }[];
}

/** A single x position across all series, used for hover lookups. */
interface XSlot {
  x: number;
  xLabel: string;
}

type XKind = "numeric" | "date" | "category";

function render(
  el: SparqlResults,
  result: SPARQLResults,
  config: LinePlotRenderConfig,
) {
  const container = el.shadowRoot!.getElementById("result") as HTMLElement;
  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "lineplot";
  container.appendChild(root);

  const ySelected = config.y.filter((v) => result.head.vars.includes(v));
  if (!result.head.vars.includes(config.x) || ySelected.length === 0) {
    showEmpty(root, "Line plot config does not match the result columns.");
    return;
  }

  // Determine the x-axis kind: a continuous numeric scale, a time scale for
  // date(Time) literals, or an evenly-spaced categorical axis in row order.
  const bindings = result.results.bindings;
  const rawNum = bindings.map((b) => numericOf(b[config.x]));
  const xIsNumeric = bindings.length > 0 && rawNum.every((v) => v !== null);
  const rawDate = xIsNumeric ? [] : bindings.map((b) => dateOf(b[config.x]));
  const xIsDate =
    !xIsNumeric && bindings.length > 0 && rawDate.every((v) => v !== null);
  const xKind: XKind = xIsNumeric ? "numeric" : xIsDate ? "date" : "category";

  // Build an x slot per row so all series share the same x positions.
  const slots: XSlot[] = bindings.map((b, i) => ({
    x:
      xKind === "numeric"
        ? (rawNum[i] as number)
        : xKind === "date"
          ? (rawDate[i] as number)
          : i,
    xLabel:
      xKind === "date"
        ? formatDate(rawDate[i] as number)
        : (labelOf(b[config.x]) ?? String(i)),
  }));

  const order =
    xKind === "category"
      ? slots.map((_, i) => i)
      : slots.map((_, i) => i).sort((a, b) => slots[a].x - slots[b].x);

  const series: Series[] = ySelected.map((name, si) => {
    const points = order
      .map((rowIdx) => {
        const y = numericOf(result.results.bindings[rowIdx][name]);
        return y === null
          ? null
          : { x: slots[rowIdx].x, xLabel: slots[rowIdx].xLabel, y };
      })
      .filter((p): p is Series["points"][number] => p !== null);
    return { name, color: PALETTE[si % PALETTE.length], points };
  });

  if (series.every((s) => s.points.length === 0)) {
    showEmpty(root, "No numeric values to plot for the selected columns.");
    return;
  }

  // Redraw whenever the container width changes so the SVG's user-space always
  // matches its rendered size. An SVG measured at one width but displayed at
  // another (e.g. embedded in a panel that lays out after render) gets scaled,
  // which visibly thickens strokes and enlarges dots. The observer also fires
  // once on observe, providing the correct post-layout width for the first draw.
  const disabled = new Set<string>();
  let lastWidth = 0;
  const observer = new ResizeObserver((entries) => {
    const width = Math.round(entries[0].contentRect.width);
    if (width && width !== lastWidth) {
      lastWidth = width;
      draw(root, series, slots, order, config, xKind, disabled);
    }
  });
  observers.get(container)?.disconnect();
  observers.set(container, observer);
  observer.observe(root);
}

function draw(
  root: HTMLElement,
  series: Series[],
  slots: XSlot[],
  order: number[],
  config: LinePlotRenderConfig,
  xKind: XKind,
  disabled: Set<string>,
) {
  const xIsContinuous = xKind !== "category";
  // Rebuild from scratch: draw runs once per width change (see render).
  root.replaceChildren();
  // Legend (also toggles series visibility on click).
  const legend = document.createElement("div");
  legend.className = "lp-legend";
  root.appendChild(legend);

  // Layout. Width is measured from the container; height follows a ratio.
  const width = root.clientWidth || 640;
  const height = Math.max(240, Math.round(width * 0.5));
  const margin = { top: 16, right: 24, bottom: 44, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const xExtent = order.map((i) => slots[i].x);
  const xDomain = extent(xExtent) as [number, number];
  const continuousX =
    xKind === "date"
      ? scaleTime().domain(xDomain).range([0, innerW]).nice()
      : scaleLinear().domain(xDomain).nice().range([0, innerW]);
  const categoryX = scalePoint<number>()
    .domain(order.map((i) => slots[i].x))
    .range([0, innerW])
    .padding(0.5);
  const xScale = xIsContinuous ? continuousX : categoryX;

  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const yMin = Math.min(0, min(allY) ?? 0);
  const yMax = max(allY) ?? 1;
  const yScale = scaleLinear().domain([yMin, yMax]).nice().range([innerH, 0]);

  const px = (x: number) =>
    ((xScale as (v: number) => number)(x) ?? 0) + margin.left;
  const py = (y: number) => yScale(y) + margin.top;

  const svg = create("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("role", "img");

  // Gridlines.
  svg
    .append("g")
    .attr("class", "lp-grid")
    .attr("transform", `translate(${margin.left},${margin.top})`)
    .call(
      axisLeft(yScale)
        .tickSize(-innerW)
        .tickFormat(() => "") as any,
    );

  // Axes. Continuous scales (numeric/time) format their own ticks; the time
  // scale picks readable date ticks automatically.
  const xAxis = xIsContinuous
    ? axisBottom(continuousX).ticks(6)
    : axisBottom(categoryX)
        .tickFormat((d) => slots[d as number].xLabel)
        .tickValues(
          maybeThin(
            order.map((i) => slots[i].x),
            innerW,
          ),
        );

  svg
    .append("g")
    .attr("class", "lp-axis")
    .attr("transform", `translate(${margin.left},${innerH + margin.top})`)
    .call(xAxis as any);

  svg
    .append("g")
    .attr("class", "lp-axis")
    .attr("transform", `translate(${margin.left},${margin.top})`)
    .call(axisLeft(yScale).ticks(6));

  // Axis labels.
  svg
    .append("text")
    .attr("class", "lp-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", margin.left + innerW / 2)
    .attr("y", height - 6)
    .text(config.xLabel ?? config.x);

  svg
    .append("text")
    .attr("class", "lp-axis-label")
    .attr("text-anchor", "middle")
    .attr("transform", `translate(14,${margin.top + innerH / 2}) rotate(-90)`)
    .text(config.yLabel ?? (series.length === 1 ? series[0].name : "value"));

  const line = d3line<{ x: number; y: number }>()
    .x((d) => px(d.x))
    .y((d) => py(d.y))
    .curve(curveMonotoneX);

  // One group per series holding its line + dots.
  const seriesG = svg
    .selectAll<SVGGElement, Series>("g.lp-series")
    .data(series)
    .join("g")
    .attr("class", "lp-series")
    .attr("data-series", (d) => d.name);

  seriesG
    .append("path")
    .attr("class", "lp-line")
    .attr("stroke", (d) => d.color)
    .attr("d", (d) => line(d.points));

  seriesG
    .selectAll("circle")
    .data((d) => d.points.map((p) => ({ ...p, color: d.color })))
    .join("circle")
    .attr("class", "lp-dot")
    .attr("cx", (d) => px(d.x))
    .attr("cy", (d) => py(d.y))
    .attr("r", series.flatMap((s) => s.points).length > 80 ? 0 : 3)
    .attr("fill", (d) => d.color);

  // Interactive overlay: crosshair, focus dots and tooltip on hover.
  const crosshair = svg
    .append("line")
    .attr("class", "lp-crosshair")
    .attr("y1", margin.top)
    .attr("y2", margin.top + innerH)
    .style("display", "none");

  const focusDots = svg.append("g").style("display", "none");

  const tooltip = document.createElement("div");
  tooltip.className = "lp-tooltip";
  root.appendChild(tooltip);

  // Sorted unique x positions for nearest-point lookup.
  const xSlots = order.map((i) => slots[i]).sort((a, b) => a.x - b.x);
  const bisect = bisector<XSlot, number>((d) => d.x).center;

  svg
    .append("rect")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", innerW)
    .attr("height", innerH)
    .attr("fill", "transparent")
    .on("pointermove", (event) => {
      const [mx] = pointer(event);
      const xVal = xIsContinuous
        ? +continuousX.invert(mx - margin.left)
        : nearestPoint(categoryX, mx - margin.left);
      const idx = bisect(xSlots, xVal);
      const slot = xSlots[idx];
      if (!slot) return;

      crosshair
        .attr("x1", px(slot.x))
        .attr("x2", px(slot.x))
        .style("display", null);

      const rows: { name: string; color: string; y: number }[] = [];
      const dots = focusDots
        .style("display", null)
        .selectAll<SVGCircleElement, Series>("circle")
        .data(series.filter((s) => !disabled.has(s.name)));
      dots
        .join("circle")
        .attr("class", "lp-focus-dot")
        .attr("r", 5)
        .attr("fill", (s) => s.color)
        .each(function (s) {
          const p = s.points.find((pt) => pt.x === slot.x);
          if (p) {
            select(this)
              .style("display", null)
              .attr("cx", px(p.x))
              .attr("cy", py(p.y));
            rows.push({ name: s.name, color: s.color, y: p.y });
          } else {
            select(this).style("display", "none");
          }
        });

      if (rows.length === 0) {
        tooltip.classList.remove("lp-visible");
        return;
      }

      tooltip.innerHTML =
        `<div class="lp-tooltip-x">${escapeHtml(slot.xLabel)}</div>` +
        rows
          .map(
            (r) =>
              `<div class="lp-tooltip-row">` +
              `<span class="lp-tooltip-swatch" style="background:${r.color}"></span>` +
              `<span class="lp-tooltip-name">${escapeHtml(r.name)}</span>` +
              `<span class="lp-tooltip-value">${formatNumber(r.y)}</span>` +
              `</div>`,
          )
          .join("");
      tooltip.classList.add("lp-visible");

      // Position tooltip near the cursor, flipping to stay inside the root.
      const cx = px(slot.x);
      const tw = tooltip.offsetWidth;
      const left = cx + 14 + tw > width ? cx - 14 - tw : cx + 14;
      tooltip.style.left = `${Math.max(0, left)}px`;
      tooltip.style.top = `${margin.top + 8}px`;
    })
    .on("pointerleave", () => {
      crosshair.style("display", "none");
      focusDots.style("display", "none");
      tooltip.classList.remove("lp-visible");
    });

  root.appendChild(svg.node()!);

  // Build the legend now that the svg exists, so toggling can update it.
  const updateVisibility = () => {
    seriesG.style("display", (d) => (disabled.has(d.name) ? "none" : null));
    legend.querySelectorAll<HTMLElement>(".lp-legend-item").forEach((item) => {
      item.classList.toggle("lp-disabled", disabled.has(item.dataset.series!));
    });
  };

  for (const s of series) {
    const item = document.createElement("div");
    item.className = "lp-legend-item";
    item.dataset.series = s.name;
    item.innerHTML =
      `<span class="lp-legend-swatch" style="background:${s.color}"></span>` +
      `<span>${escapeHtml(s.name)}</span>`;
    item.addEventListener("click", () => {
      if (disabled.has(s.name)) disabled.delete(s.name);
      else if (disabled.size < series.length - 1) disabled.add(s.name);
      updateVisibility();
    });
    item.addEventListener("pointerenter", () => {
      root.classList.add("lp-has-hover");
      seriesG
        .select(".lp-line")
        .classed("lp-active", (d) => (d as Series).name === s.name);
    });
    item.addEventListener("pointerleave", () => {
      root.classList.remove("lp-has-hover");
    });
    legend.appendChild(item);
  }
}

/** Reduce categorical ticks so labels do not overlap. */
function maybeThin(values: number[], innerW: number): number[] {
  const maxTicks = Math.max(2, Math.floor(innerW / 60));
  if (values.length <= maxTicks) return values;
  const step = Math.ceil(values.length / maxTicks);
  return values.filter((_, i) => i % step === 0);
}

function nearestPoint(scale: ScalePoint<number>, pos: number): number {
  const domain = scale.domain();
  let best = domain[0];
  let bestDist = Infinity;
  for (const d of domain) {
    const dist = Math.abs((scale(d) ?? 0) - pos);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

function numericOf(value: BindingValue | undefined): number | null {
  if (value == null || value.type === "uri" || value.type === "bnode") {
    return null;
  }
  if (value.type === "triple") return null;
  const n = Number(value.value);
  return Number.isFinite(n) ? n : null;
}

const DATE_DATATYPE = /#(date|dateTime|gYear|gYearMonth)$/;

/** Epoch milliseconds for xsd date/time literals, else null. */
function dateOf(value: BindingValue | undefined): number | null {
  if (value == null || value.type !== "literal" || !value.datatype) return null;
  if (!DATE_DATATYPE.test(value.datatype)) return null;
  const t = Date.parse(value.value);
  return Number.isFinite(t) ? t : null;
}

/** Compact label for a date tooltip: drops the time part when it is midnight. */
function formatDate(ms: number): string {
  const iso = new Date(ms).toISOString();
  return iso.endsWith("T00:00:00.000Z")
    ? iso.slice(0, 10)
    : iso.slice(0, 16) + "Z";
}

function labelOf(value: BindingValue | undefined): string | null {
  if (value == null) return null;
  if (value.type === "triple") return null;
  return value.value;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showEmpty(root: HTMLElement, message: string) {
  const div = document.createElement("div");
  div.className = "lp-empty";
  div.textContent = message;
  root.appendChild(div);
}
