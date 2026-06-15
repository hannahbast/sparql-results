import { defineConfig } from "vite";
import dts from "unplugin-dts/vite";

export default defineConfig({
  plugins: [dts({ compilerOptions: { rootDir: "src" }, exclude: ["src/main.ts"] })],
  build: {
    copyPublicDir: false,
    lib: {
      entry: "src/sparql-results.ts",
      name: "SparqlResults",
      fileName: "sparql-results",
      formats: ["es"],
    },
  },
});
