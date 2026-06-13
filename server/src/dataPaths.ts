import { dirname, join } from "path";
import { fileURLToPath } from "url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Repo `data/` directory, or packaged resources when `STARCRAFT_DS_DATA_DIR` is set. */
export function getDataRoot(): string {
  if (process.env.STARCRAFT_DS_DATA_DIR) {
    return process.env.STARCRAFT_DS_DATA_DIR;
  }
  return join(moduleDir, "../../data");
}

export function dataPath(...segments: string[]): string {
  return join(getDataRoot(), ...segments);
}
