import { readFile } from "node:fs/promises";
import { assertLandingViewportMatrix } from "./landing-viewport.mjs";

const path = process.argv[2];
if (!path) throw new Error("Pass the JSON observations collected with measureLandingViewport");
const samples = JSON.parse(await readFile(path, "utf8"));
assertLandingViewportMatrix(samples);
process.stdout.write(`Verified ${samples.length} landing viewport observations\n`);
