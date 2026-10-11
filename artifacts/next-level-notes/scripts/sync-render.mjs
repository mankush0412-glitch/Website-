import { cp, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const builtSite = path.resolve(scriptDir, "../dist/public");
const renderPublicDir = path.resolve(
  scriptDir,
  "../../../e-com-main/public",
);

await access(path.join(builtSite, "index.html"));
await cp(builtSite, renderPublicDir, { recursive: true, force: true });
console.info(`Copied the built storefront to ${renderPublicDir}`);
