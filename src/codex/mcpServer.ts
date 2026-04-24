import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  ComputerExecutor,
  FrontmostApp,
  InstalledApp,
  RunningApp,
  ScreenshotResult,
} from "../upstream/executor.js";
import type { ComputerUseHostAdapter, Logger } from "../upstream/types.js";
import {
  executeCodexActions,
  parseCodexComputerActions,
  type CodexObservation,
  type CodexSessionState,
  type CoordinateSpace,
} from "./actions.js";
import { saveScreenshotBase64 } from "./screenshotStore.js";

interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  items?: unknown;
}

interface CodexToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

function jsonText(value: unknown): { type: "text"; text: string } {
  return { type: "text", text: JSON.stringify(value, null, 2) };
}

function okResult(
  structuredContent: Record<string, unknown>,
  extraContent: Array<{ type: "image"; data: string; mimeType: string }> = [],
): CallToolResult {
  return {
    content: [jsonText(structuredContent), ...extraContent],
    structuredContent,
  };
}

function errorResult(message: string): CallToolResult {
  const structuredContent = { ok: false, error: message };
  return {
    content: [jsonText(structuredContent)],
    structuredContent,
    isError: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArrayArg(
  args: Record<string, unknown>,
  key: string,
  fallback: string[] = [],
): string[] {
  const value = args[key];
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${key} must be an array of strings.`);
  }
  return value;
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return value;
}

function booleanArg(args: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = args[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean.`);
  }
  return value;
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value;
}

function coordinateSpaceArg(args: Record<string, unknown>): CoordinateSpace {
  const value = args.coordinateSpace;
  if (value === undefined) return "image";
  if (value === "image" || value === "display") return value;
  throw new Error('coordinateSpace must be "image" or "display".');
}

function appBasename(bundleId: string): string {
  const parts = bundleId.replace(/\//g, "\\").split("\\");
  return (parts.at(-1) ?? bundleId).toLowerCase();
}

function scoreAppMatch(query: string, app: InstalledApp | RunningApp): number {
  const q = query.toLowerCase().replace(/\.exe$/i, "").trim();
  const display = app.displayName.toLowerCase();
  const bundle = app.bundleId.toLowerCase();
  const exe = appBasename(bundle).replace(/\.exe$/i, "");

  if (bundle === query.toLowerCase()) return 1000;
  if (display === q) return 900;
  if (exe === q) return 850;
  if (display.includes(q)) return 600 - display.length;
  if (bundle.includes(q)) return 500 - bundle.length;
  if (q.includes(display)) return 300 + display.length;
  return 0;
}

async function resolveApps(
  executor: ComputerExecutor,
  queries: string[],
): Promise<{
  resolved: Array<{ bundleId: string; displayName: string }>;
  unresolved: string[];
}> {
  const [installed, running] = await Promise.all([
    executor.listInstalledApps().catch(() => [] as InstalledApp[]),
    executor.listRunningApps().catch(() => [] as RunningApp[]),
  ]);

  const candidates = [...installed, ...running];
  const resolved: Array<{ bundleId: string; displayName: string }> = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    let best: { app: InstalledApp | RunningApp; score: number } | undefined;
    for (const app of candidates) {
      const score = scoreAppMatch(query, app);
      if (score > 0 && (!best || score > best.score)) {
        best = { app, score };
      }
    }

    if (best) {
      const key = best.app.bundleId.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        resolved.push({
          bundleId: best.app.bundleId,
          displayName: best.app.displayName,
        });
      }
    } else if (/\.exe$/i.test(query) || query.includes("\\")) {
      const key = query.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        resolved.push({
          bundleId: query,
          displayName: appBasename(query).toUpperCase(),
        });
      }
    } else {
      unresolved.push(query);
    }
  }

  return { resolved, unresolved };
}

function grantApps(
  state: CodexSessionState,
  apps: Array<{ bundleId: string; displayName: string }>,
): void {
  const now = Date.now();
  for (const app of apps) {
    state.allowedApps.set(app.bundleId, {
      bundleId: app.bundleId,
      displayName: app.displayName,
      grantedAt: now,
    });
  }
}

function summarizeObservation(observation: CodexObservation): Record<string, unknown> {
  return {
    filePath: observation.filePath,
    mimeType: observation.mimeType,
    imageWidth: observation.width,
    imageHeight: observation.height,
    displayWidth: observation.displayWidth,
    displayHeight: observation.displayHeight,
    displayId: observation.displayId,
    originX: observation.originX,
    originY: observation.originY,
    coordinateSpace: observation.coordinateSpace,
    imageToDisplayScaleX: observation.imageToDisplayScaleX,
    imageToDisplayScaleY: observation.imageToDisplayScaleY,
    note:
      "Action coordinates default to image-space pixels from this screenshot. " +
      "Argus maps them to display coordinates before controlling Windows.",
  };
}

async function captureObservation(
  executor: ComputerExecutor,
  state: CodexSessionState,
  displayId?: number,
): Promise<CodexObservation> {
  const shot: ScreenshotResult = await executor.screenshot({
    allowedBundleIds: [...state.allowedApps.keys()],
    displayId,
  });
  const filePath = await saveScreenshotBase64(shot.base64, "codex");
  const observation: CodexObservation = {
    ...shot,
    filePath,
    mimeType: "image/jpeg",
    coordinateSpace: "image",
    imageToDisplayScaleX: shot.displayWidth / shot.width,
    imageToDisplayScaleY: shot.displayHeight / shot.height,
  };
  state.lastObservation = observation;
  return observation;
}

function buildCodexTools(): CodexToolDefinition[] {
  return [
    {
      name: "computer_status",
      description:
        "Report Argus Codex Windows computer-use status. This local MCP tool uses the current Codex session and never asks for an OpenAI API key.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "computer_authorize",
      description:
        "Authorize desktop apps for this session before sending input. Use executable names like EXCEL.EXE or display names like Notepad.",
      inputSchema: {
        type: "object",
        properties: {
          apps: {
            type: "array",
            items: { type: "string" },
            description: "App names, executable names, AUMIDs, or full executable paths.",
          },
        },
        required: ["apps"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_open_application",
      description:
        "Open or activate a Windows application, then authorize it for follow-up computer_execute actions.",
      inputSchema: {
        type: "object",
        properties: {
          app: {
            type: "string",
            description: "Executable name, display name, AUMID, or full executable path.",
          },
          waitMs: {
            type: "number",
            description: "Optional settle delay after launch. Defaults to 1000.",
          },
        },
        required: ["app"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_list_apps",
      description: "List installed and running desktop apps that Argus can target.",
      inputSchema: {
        type: "object",
        properties: {
          includeInstalled: { type: "boolean" },
          includeRunning: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "computer_observe",
      description:
        "Capture the current screen. Returns an MCP image block plus a local screenshot file path and coordinate mapping metadata.",
      inputSchema: {
        type: "object",
        properties: {
          displayId: { type: "number" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "computer_execute",
      description:
        "Execute a batch of GPT-style computer actions: click, double_click, scroll, type, keypress, drag, move, wait, screenshot. Coordinates default to image-space pixels from the last computer_observe screenshot.",
      inputSchema: {
        type: "object",
        properties: {
          actions: {
            type: "array",
            items: { type: "object" },
            description: "Array of action objects. Coordinate actions use x/y fields.",
          },
          coordinateSpace: {
            type: "string",
            enum: ["image", "display"],
            description: "Default coordinate space for coordinate actions. Defaults to image.",
          },
          displayId: { type: "number" },
          screenshotAfter: {
            type: "boolean",
            description: "Capture and return a fresh screenshot after executing actions.",
          },
        },
        required: ["actions"],
        additionalProperties: false,
      },
    },
    {
      name: "computer_clipboard",
      description:
        "Read or write the Windows clipboard. Prefer computer_execute type actions for normal text entry.",
      inputSchema: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["read", "write"] },
          text: { type: "string" },
        },
        required: ["operation"],
        additionalProperties: false,
      },
    },
  ];
}

export function createCodexComputerUseMcpServer(
  adapter: ComputerUseHostAdapter,
): Server {
  const { executor, logger, serverName } = adapter;
  const state: CodexSessionState = {
    allowedApps: new Map(),
  };

  const server = new Server(
    { name: `${serverName}-codex`, version: "0.1.0" },
    { capabilities: { tools: {}, logging: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildCodexTools(),
  }));

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const name = request.params.name;
      const args = isRecord(request.params.arguments)
        ? request.params.arguments
        : {};

      try {
        logger.debug(`[codex] tool=${name}`);

        if (name === "computer_status") {
          const [displays, frontmost, cursor] = await Promise.all([
            executor.listDisplays(),
            executor.getFrontmostApp().catch(() => null as FrontmostApp | null),
            executor.getCursorPosition().catch(() => undefined),
          ]);
          return okResult({
            ok: true,
            mode: "codex-local-mcp",
            usesOpenAiApiKey: false,
            quotaSource:
              "Codex invokes this local MCP server with the active Codex session; Argus does not call the OpenAI API.",
            platform: executor.capabilities.platform,
            screenshotFiltering: executor.capabilities.screenshotFiltering,
            displays,
            frontmost,
            cursor,
            authorizedApps: [...state.allowedApps.values()],
            hasLastObservation: state.lastObservation !== undefined,
          });
        }

        if (name === "computer_authorize") {
          const apps = stringArrayArg(args, "apps");
          const resolved = await resolveApps(executor, apps);
          grantApps(state, resolved.resolved);
          return okResult({
            ok: true,
            authorizedApps: [...state.allowedApps.values()],
            unresolvedApps: resolved.unresolved,
          });
        }

        if (name === "computer_open_application") {
          const app = stringArg(args, "app");
          const waitMs = numberArg(args, "waitMs") ?? 1000;
          const resolved = await resolveApps(executor, [app]);
          const launchTarget = resolved.resolved[0]?.bundleId ?? app;
          await executor.openApp(launchTarget);
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs)));
          const frontmost = await executor.getFrontmostApp().catch(() => null);
          const grantTargets = resolved.resolved.length > 0
            ? resolved.resolved
            : frontmost
              ? [{ bundleId: frontmost.bundleId, displayName: frontmost.displayName }]
              : [{ bundleId: app, displayName: app }];
          grantApps(state, grantTargets);
          return okResult({
            ok: true,
            opened: launchTarget,
            frontmost,
            authorizedApps: [...state.allowedApps.values()],
            unresolvedApps: resolved.unresolved,
          });
        }

        if (name === "computer_list_apps") {
          const includeInstalled = booleanArg(args, "includeInstalled", true);
          const includeRunning = booleanArg(args, "includeRunning", true);
          const [installed, running] = await Promise.all([
            includeInstalled ? executor.listInstalledApps() : Promise.resolve([]),
            includeRunning ? executor.listRunningApps() : Promise.resolve([]),
          ]);
          return okResult({
            ok: true,
            installed,
            running,
          });
        }

        if (name === "computer_observe") {
          const displayId = numberArg(args, "displayId");
          const observation = await captureObservation(executor, state, displayId);
          return okResult(
            {
              ok: true,
              screenshot: summarizeObservation(observation),
            },
            [{ type: "image", data: observation.base64, mimeType: observation.mimeType }],
          );
        }

        if (name === "computer_execute") {
          const actions = parseCodexComputerActions(args.actions);
          const displayId = numberArg(args, "displayId");
          const coordinateSpace = coordinateSpaceArg(args);
          const records = await executeCodexActions(
            executor,
            state,
            actions,
            { defaultCoordinateSpace: coordinateSpace, displayId },
            logger,
          );
          const screenshotAfter = booleanArg(args, "screenshotAfter", false);
          if (screenshotAfter) {
            const observation = await captureObservation(executor, state, displayId);
            return okResult(
              {
                ok: true,
                actions: records,
                screenshot: summarizeObservation(observation),
              },
              [{ type: "image", data: observation.base64, mimeType: observation.mimeType }],
            );
          }
          return okResult({ ok: true, actions: records });
        }

        if (name === "computer_clipboard") {
          const operation = stringArg(args, "operation");
          if (operation === "read") {
            const text = await executor.readClipboard();
            return okResult({ ok: true, operation, text });
          }
          if (operation === "write") {
            const text = stringArg(args, "text");
            await executor.writeClipboard(text);
            return okResult({ ok: true, operation, length: text.length });
          }
          throw new Error('operation must be "read" or "write".');
        }

        return errorResult(`Unknown Codex computer-use tool: ${name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[codex] tool=${name} failed: ${message}`);
        return errorResult(message);
      }
    },
  );

  return server;
}

