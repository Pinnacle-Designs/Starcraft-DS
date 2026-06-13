import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { dataPath } from "../dataPaths.js";

const refDir = dataPath("unit-reference");

let collageCache: string | undefined;

/** Labeled SC2 unit portrait sheet (built by npm run fetch-unit-images). */
export function getUnitReferenceCollageBase64(): string | null {
  if (collageCache !== undefined) {
    return collageCache || null;
  }
  const collagePath = join(refDir, "collage.jpg");
  if (!existsSync(collagePath)) {
    collageCache = "";
    return null;
  }
  collageCache = readFileSync(collagePath).toString("base64");
  return collageCache;
}

export function hasUnitReferenceCollage(): boolean {
  return getUnitReferenceCollageBase64() !== null;
}
