import { copyFileSync } from "node:fs";

// Include the license and its asset exclusions with the distributable build.
for (const name of ["LICENSE", "LICENSING.md"])
  copyFileSync(new URL(`../${name}`, import.meta.url), new URL(`../dist/${name}`, import.meta.url));
