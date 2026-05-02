import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tools from "../tools.js";

const MAIL_DISPATCH_OPERATIONS = [
  "unread",
  "latest",
  "search",
  "searchMetadata",
  "setMessageFlag",
  "exportMessageArtifacts",
  "moveMessage",
  "send",
  "mailboxes",
  "accounts",
  "accountSummaries",
  "accountDetails",
  "mailboxTree",
  "mailboxProps",
  "messages",
  "messageMetadata",
  "createMailbox",
  "deleteMailbox",
  "renameMailbox",
  "moveMailbox",
];

interface PackageInfo {
  name?: string;
  version?: string;
}

interface ManifestInfo {
  version?: string;
}

interface RuntimeToolInfo {
  name: string;
  operations: string[];
  source: string;
}

interface RuntimeInfo {
  package: PackageInfo;
  manifest: ManifestInfo;
  server: {
    name: string;
    version: string;
  };
  entrypoint: {
    argv: string[];
    execPath: string;
    mainModuleUrl: string;
    detectedMode: string;
  };
  build: {
    artifact: string | null;
    artifactMtime: string | null;
    source: string;
  };
  git: {
    commit: string | null;
    shortCommit: string | null;
    dirty: boolean | null;
    source: string;
  };
  runtime: {
    node: string;
    bun: string | null;
    platform: NodeJS.Platform;
    arch: string;
    pid: number;
    hostname: string;
  };
  tools: RuntimeToolInfo[];
  mail: {
    schemaOperations: string[];
    dispatchOperations: string[];
    schemaDispatchDrift: {
      dispatchOnly: string[];
      schemaOnly: string[];
    };
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return uniqueSorted(left.filter((value) => !rightSet.has(value)));
}

async function findProjectRoot(startDir: string): Promise<string> {
  let current = startDir;

  while (true) {
    try {
      await stat(path.join(current, "package.json"));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return startDir;
      }
      current = parent;
    }
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function getArtifactMtime(rootDir: string, artifact: string | null): Promise<string | null> {
  if (!artifact) {
    return null;
  }

  try {
    return (await stat(path.join(rootDir, artifact))).mtime.toISOString();
  } catch {
    return null;
  }
}

function detectMode(argv: string[], execPath: string): string {
  const entry = argv[1] ?? "";

  if (entry.endsWith("/dist/index.js") || entry.endsWith("\\dist\\index.js")) {
    return "node-dist";
  }

  if (entry.endsWith("/index.ts") || entry.endsWith("\\index.ts")) {
    return process.versions.bun ? "bun-ts" : "source-ts";
  }

  if (execPath.includes("bun")) {
    return "bun";
  }

  return "unknown";
}

function detectArtifact(argv: string[], detectedMode: string): string | null {
  const entry = argv[1] ?? "";

  if (detectedMode === "node-dist") {
    return "dist/index.js";
  }

  if (detectedMode === "bun-ts" || detectedMode === "source-ts") {
    return "index.ts";
  }

  if (entry.endsWith("index.js")) {
    return path.basename(path.dirname(entry)) === "dist" ? "dist/index.js" : "index.js";
  }

  return null;
}

function getToolOperations(): RuntimeToolInfo[] {
  return tools.map((tool) => {
    const schema = tool.inputSchema as {
      properties?: {
        operation?: {
          enum?: unknown;
        };
      };
    };
    const operations = Array.isArray(schema.properties?.operation?.enum)
      ? schema.properties.operation.enum.filter((value): value is string => typeof value === "string")
      : [];

    return {
      name: tool.name,
      operations,
      source: "tools.ts schema",
    };
  });
}

async function readGitCommitFromFiles(rootDir: string): Promise<string | null> {
  const gitDir = path.join(rootDir, ".git");
  const head = (await readTextFile(path.join(gitDir, "HEAD")))?.trim();

  if (!head) {
    return null;
  }

  if (!head.startsWith("ref: ")) {
    return head;
  }

  const ref = head.slice("ref: ".length).trim();
  const looseRef = (await readTextFile(path.join(gitDir, ref)))?.trim();

  if (looseRef) {
    return looseRef;
  }

  const packedRefs = await readTextFile(path.join(gitDir, "packed-refs"));
  if (!packedRefs) {
    return null;
  }

  for (const line of packedRefs.split("\n")) {
    if (line.startsWith("#") || line.startsWith("^")) {
      continue;
    }

    const [commit, packedRef] = line.trim().split(" ");
    if (packedRef === ref && commit) {
      return commit;
    }
  }

  return null;
}

async function getGitInfo(rootDir: string): Promise<RuntimeInfo["git"]> {
  const envCommit =
    process.env.APPLE_MCP_GIT_COMMIT ??
    process.env.SOURCE_VERSION ??
    process.env.GIT_COMMIT ??
    null;

  if (envCommit) {
    return {
      commit: envCommit,
      shortCommit: envCommit.slice(0, 12),
      dirty: null,
      source: "env",
    };
  }

  const commit = await readGitCommitFromFiles(rootDir);

  return {
    commit,
    shortCommit: commit ? commit.slice(0, 12) : null,
    dirty: null,
    source: commit ? "git-files" : "unavailable",
  };
}

async function getRuntimeInfo(): Promise<RuntimeInfo> {
  const modulePath = fileURLToPath(import.meta.url);
  const rootDir = await findProjectRoot(path.dirname(modulePath));
  const packageInfo = await readJsonFile<PackageInfo>(path.join(rootDir, "package.json"));
  const manifestInfo = await readJsonFile<ManifestInfo>(path.join(rootDir, "manifest.json"));
  const argv = [...process.argv];
  const detectedMode = detectMode(argv, process.execPath);
  const artifact = detectArtifact(argv, detectedMode);
  const runtimeTools = getToolOperations();
  const mailSchemaOperations = runtimeTools.find((tool) => tool.name === "mail")?.operations ?? [];
  const dispatchOperations = [...MAIL_DISPATCH_OPERATIONS];

  return {
    package: {
      name: packageInfo?.name,
      version: packageInfo?.version,
    },
    manifest: {
      version: manifestInfo?.version,
    },
    server: {
      name: "Apple MCP tools",
      version: "1.0.0",
    },
    entrypoint: {
      argv,
      execPath: process.execPath,
      mainModuleUrl: import.meta.url,
      detectedMode,
    },
    build: {
      artifact,
      artifactMtime: await getArtifactMtime(rootDir, artifact),
      source: artifact ? "artifact-mtime" : "unavailable",
    },
    git: await getGitInfo(rootDir),
    runtime: {
      node: process.version,
      bun: process.versions.bun ?? null,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      hostname: os.hostname(),
    },
    tools: runtimeTools,
    mail: {
      schemaOperations: mailSchemaOperations,
      dispatchOperations,
      schemaDispatchDrift: {
        dispatchOnly: difference(dispatchOperations, mailSchemaOperations),
        schemaOnly: difference(mailSchemaOperations, dispatchOperations),
      },
    },
  };
}

export { getRuntimeInfo, MAIL_DISPATCH_OPERATIONS };
export type { RuntimeInfo };

export default {
  getRuntimeInfo,
};
