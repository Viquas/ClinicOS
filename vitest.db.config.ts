import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      /*
       * `server-only` throws unless it is resolved inside a React Server
       * Component graph, which Vitest is not. Stubbing it here keeps the
       * guard doing its real job in the Next build while letting the query
       * layer be tested directly.
       */
      "server-only": resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.itest.ts"],
    setupFiles: ["./test/load-env.ts"],
    /* Shared database — parallel files would race on the same rows. */
    fileParallelism: false,
  },
});
