import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export async function directoryRoot(directory: string) {
  const root = await realpath(resolve(directory));
  if (!(await lstat(root)).isDirectory()) {
    throw new Error(`The destination must be a directory: ${directory}`);
  }
  return root;
}

export function resolveFile(root: string, name: string) {
  if (!name || name.includes("\\") || name.includes(":")) {
    throw new Error(`Invalid file path: ${name}`);
  }
  const path = resolve(root, name);
  const within = relative(root, path);
  if (
    !within ||
    isAbsolute(name) ||
    within.startsWith("..") ||
    isAbsolute(within)
  ) {
    throw new Error(
      `The path must stay within the destination directory: ${name}`
    );
  }
  return path;
}

// Do not follow existing links when reading or writing managed files.
export async function readOrdinaryFileBytes(
  root: string,
  name: string
): Promise<Buffer | null> {
  const path = resolveFile(root, name);
  const segments = relative(root, path).split(/[\\/]/u);
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`The path contains a symbolic link: ${name}`);
    }
    if (index < segments.length - 1 ? !info.isDirectory() : !info.isFile()) {
      throw new Error(
        `The path is occupied by an incompatible file or directory: ${name}`
      );
    }
  }
  return readFile(path);
}

export async function readOrdinaryFile(root: string, name: string) {
  const content = await readOrdinaryFileBytes(root, name);
  return content === null ? null : content.toString("utf-8");
}

export async function requiredProjectFile(root: string, name: string) {
  const source = await readOrdinaryFile(root, name);
  if (source === null) {
    throw new Error(
      `Missing ${name}. Restore it before running dinvolt setup.`
    );
  }
  return source;
}
