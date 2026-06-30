/**
 * Write the OpenAPI document to a committed openapi.json so it can be linked
 * from the README and consumed by external tools. Run with `npm run openapi`.
 * The served /docs spec is built from the same buildOpenApiSpec(), so they
 * never drift.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildOpenApiSpec } from "../src/swagger";

const spec = buildOpenApiSpec();
const outPath = path.join(__dirname, "..", "openapi.json");
writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);
// eslint-disable-next-line no-console
console.log(`wrote ${outPath}`);
