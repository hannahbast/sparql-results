import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/sparql-results.ts",
      name: "SparqlResults",
      fileName: "sparql-results",
    },
  },
});
