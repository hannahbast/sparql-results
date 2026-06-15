# sparql-results

A framework-agnostic web component for rendering [SPARQL JSON results](https://www.w3.org/TR/sparql11-results-json/).

Feed it a standard SPARQL results object and a render config, and it draws a
table or a line plot inside a `<sparql-results>` custom element. Tables support
IRI shortening, SPARQL-star, images, and optional infinite-scroll pagination.

## Usage

```js
import "sparql-results";

const el = document.querySelector("sparql-results");

const results = {
  head: { vars: ["country", "population"] },
  results: {
    bindings: [
      {
        country: { type: "literal", value: "Germany" },
        population: { type: "literal", value: "83000000" },
      },
      {
        country: { type: "literal", value: "France" },
        population: { type: "literal", value: "68000000" },
      },
    ],
  },
};

el.render_results(results, { type: "table" });
```

```html
<sparql-results></sparql-results>
```

To draw a line plot instead, pass a `lineplot` config naming the variables to
use for each axis:

```js
el.render_results(results, { type: "lineplot", x: "country", y: ["population"] });
```

## Development

```sh
npm run dev      # start the Vite dev server with a fixture browser
npm run build    # type-check and build the distributable
```
