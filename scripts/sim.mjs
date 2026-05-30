import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
});

try {
  const { runCli } = await server.ssrLoadModule("/src/sim/cli.ts");
  const output = runCli(process.argv.slice(2));
  console.log(output);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await server.close();
}
