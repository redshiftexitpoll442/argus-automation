import type {
  ComputerExecutor,
  DisplayGeometry,
  FrontmostApp,
  ScreenshotResult,
} from "../upstream/executor.js";
import type { Logger } from "../upstream/types.js";
import { isSystemKeyCombo, normalizeKeySequence } from "../upstream/keyBlocklist.js";

export type CoordinateSpace = "image" | "display";

export interface CodexObservation extends Omit<ScreenshotResult, "base64"> {
  base64: string;
  filePath: string;
  mimeType: "image/jpeg";
  coordinateSpace: "image";
  imageToDisplayScaleX: number;
  imageToDisplayScaleY: number;
}

export interface CodexSessionState {
  allowedApps: Map<string, { bundleId: string; displayName: string; grantedAt: number }>;
  lastObservation?: CodexObservation;
}

export type CodexComputerAction =
  | {
      type: "click";
      x: number;
      y: number;
      button?: "left" | "right" | "middle";
      keys?: string[];
      coordinateSpace?: CoordinateSpace;
    }
  | {
      type: "double_click";
      x: number;
      y: number;
      button?: "left" | "right" | "middle";
      keys?: string[];
      coordinateSpace?: CoordinateSpace;
    }
  | {
      type: "move";
      x: number;
      y: number;
      coordinateSpace?: CoordinateSpace;
    }
  | {
      type: "scroll";
      x: number;
      y: number;
      dx?: number;
      dy?: number;
      scrollX?: number;
      scrollY?: number;
      scroll_x?: number;
      scroll_y?: number;
      coordinateSpace?: CoordinateSpace;
    }
  | {
      type: "drag";
      path?: Array<{ x: number; y: number }>;
      from?: { x: number; y: number };
      to?: { x: number; y: number };
      coordinateSpace?: CoordinateSpace;
    }
  | {
      type: "type";
      text: string;
      viaClipboard?: boolean;
    }
  | {
      type: "keypress";
      keys?: string[];
      key?: string;
      repeat?: number;
    }
  | {
      type: "wait";
      ms?: number;
      durationMs?: number;
      seconds?: number;
    }
  | {
      type: "screenshot";
      displayId?: number;
    };

export interface ExecuteActionsOptions {
  defaultCoordinateSpace: CoordinateSpace;
  displayId?: number;
}

export interface ActionExecutionRecord {
  index: number;
  type: string;
  ok: boolean;
  message?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNumber(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Action field "${key}" must be a finite number.`);
  }
  return value;
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== "string") {
    throw new Error(`Action field "${key}" must be a string.`);
  }
  return value;
}

function optionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Action field "${key}" must be an array of strings.`);
  }
  return value;
}

function parsePoint(value: unknown, label: string): { x: number; y: number } {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object with x and y.`);
  }
  return {
    x: requireNumber(value, "x"),
    y: requireNumber(value, "y"),
  };
}

function parseCoordinateSpace(
  raw: unknown,
  fallback: CoordinateSpace,
): CoordinateSpace {
  if (raw === undefined) return fallback;
  if (raw === "image" || raw === "display") return raw;
  throw new Error('coordinateSpace must be "image" or "display".');
}

function parseButton(raw: unknown): "left" | "right" | "middle" {
  if (raw === undefined) return "left";
  if (raw === "left" || raw === "right" || raw === "middle") return raw;
  throw new Error('button must be "left", "right", or "middle".');
}

function parsePath(raw: unknown): Array<{ x: number; y: number }> | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error("drag.path must be an array of points.");
  }
  return raw.map((item, index) => parsePoint(item, `drag.path[${index}]`));
}

export function parseCodexComputerActions(raw: unknown): CodexComputerAction[] {
  if (!Array.isArray(raw)) {
    throw new Error("actions must be an array.");
  }

  return raw.map((item, index): CodexComputerAction => {
    if (!isRecord(item)) {
      throw new Error(`actions[${index}] must be an object.`);
    }

    const type = requireString(item, "type");
    switch (type) {
      case "click":
      case "double_click":
        return {
          type,
          x: requireNumber(item, "x"),
          y: requireNumber(item, "y"),
          button: parseButton(item.button),
          keys: optionalStringArray(item, "keys"),
          coordinateSpace: parseCoordinateSpace(item.coordinateSpace, "image"),
        };
      case "move":
        return {
          type,
          x: requireNumber(item, "x"),
          y: requireNumber(item, "y"),
          coordinateSpace: parseCoordinateSpace(item.coordinateSpace, "image"),
        };
      case "scroll":
        return {
          type,
          x: requireNumber(item, "x"),
          y: requireNumber(item, "y"),
          dx: typeof item.dx === "number" ? item.dx : undefined,
          dy: typeof item.dy === "number" ? item.dy : undefined,
          scrollX: typeof item.scrollX === "number" ? item.scrollX : undefined,
          scrollY: typeof item.scrollY === "number" ? item.scrollY : undefined,
          scroll_x: typeof item.scroll_x === "number" ? item.scroll_x : undefined,
          scroll_y: typeof item.scroll_y === "number" ? item.scroll_y : undefined,
          coordinateSpace: parseCoordinateSpace(item.coordinateSpace, "image"),
        };
      case "drag":
        return {
          type,
          path: parsePath(item.path),
          from: item.from === undefined ? undefined : parsePoint(item.from, "drag.from"),
          to: item.to === undefined ? undefined : parsePoint(item.to, "drag.to"),
          coordinateSpace: parseCoordinateSpace(item.coordinateSpace, "image"),
        };
      case "type":
        return {
          type,
          text: requireString(item, "text"),
          viaClipboard: typeof item.viaClipboard === "boolean" ? item.viaClipboard : undefined,
        };
      case "keypress":
        return {
          type,
          key: typeof item.key === "string" ? item.key : undefined,
          keys: optionalStringArray(item, "keys"),
          repeat: typeof item.repeat === "number" ? item.repeat : undefined,
        };
      case "wait":
        return {
          type,
          ms: typeof item.ms === "number" ? item.ms : undefined,
          durationMs: typeof item.durationMs === "number" ? item.durationMs : undefined,
          seconds: typeof item.seconds === "number" ? item.seconds : undefined,
        };
      case "screenshot":
        return {
          type,
          displayId: typeof item.displayId === "number" ? item.displayId : undefined,
        };
      default:
        throw new Error(`Unsupported action type: ${type}.`);
    }
  });
}

function pointFromImageSpace(
  point: { x: number; y: number },
  observation: CodexObservation,
): { x: number; y: number } {
  return {
    x: Math.round(point.x * (observation.displayWidth / observation.width)) +
      observation.originX,
    y: Math.round(point.y * (observation.displayHeight / observation.height)) +
      observation.originY,
  };
}

function toDisplayPoint(
  point: { x: number; y: number },
  coordinateSpace: CoordinateSpace,
  state: CodexSessionState,
): { x: number; y: number } {
  if (coordinateSpace === "display") {
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }

  if (!state.lastObservation) {
    throw new Error(
      'coordinateSpace "image" requires a prior computer_observe call or screenshot action.',
    );
  }

  return pointFromImageSpace(point, state.lastObservation);
}

function appBasename(bundleId: string): string {
  const parts = bundleId.replace(/\//g, "\\").split("\\");
  return (parts.at(-1) ?? bundleId).toLowerCase();
}

function appMatches(allowed: string, current: string): boolean {
  const a = allowed.toLowerCase();
  const c = current.toLowerCase();
  return a === c || appBasename(a) === appBasename(c);
}

function isImplicitlyAllowedApp(app: FrontmostApp | null, executor: ComputerExecutor): boolean {
  if (!app) return true;
  const id = app.bundleId.toLowerCase();
  const name = app.displayName.toLowerCase();
  return (
    id === executor.capabilities.hostBundleId.toLowerCase() ||
    id.endsWith("\\explorer.exe") ||
    id === "explorer.exe" ||
    name === "explorer"
  );
}

async function assertFrontmostAppAllowed(
  executor: ComputerExecutor,
  state: CodexSessionState,
): Promise<void> {
  if (state.allowedApps.size === 0) {
    throw new Error(
      "No desktop app is authorized. Call computer_open_application or computer_authorize first.",
    );
  }

  const frontmost = await executor.getFrontmostApp();
  if (isImplicitlyAllowedApp(frontmost, executor)) return;

  const allowed = [...state.allowedApps.values()];
  const matched = allowed.some((app) => appMatches(app.bundleId, frontmost!.bundleId));
  if (!matched) {
    throw new Error(
      `Frontmost app "${frontmost?.displayName ?? "unknown"}" is not authorized. ` +
      "Call computer_authorize for that app before sending input.",
    );
  }
}

function keysToSequence(action: Extract<CodexComputerAction, { type: "keypress" }>): string {
  if (action.key) return action.key;
  if (action.keys && action.keys.length > 0) return action.keys.join("+");
  throw new Error("keypress requires either key or keys.");
}

function normalizeModifierKeys(keys: string[] | undefined): string[] | undefined {
  if (!keys || keys.length === 0) return undefined;
  return keys.map((key) => key.toLowerCase());
}

export async function executeCodexActions(
  executor: ComputerExecutor,
  state: CodexSessionState,
  actions: CodexComputerAction[],
  options: ExecuteActionsOptions,
  logger: Logger,
): Promise<ActionExecutionRecord[]> {
  const records: ActionExecutionRecord[] = [];
  const display: DisplayGeometry = await executor.getDisplaySize(options.displayId);
  logger.debug(`[codex] action display=${JSON.stringify(display)}`);

  for (let index = 0; index < actions.length; index++) {
    const action = actions[index]!;
    try {
      switch (action.type) {
        case "click": {
          await assertFrontmostAppAllowed(executor, state);
          const point = toDisplayPoint(
            { x: action.x, y: action.y },
            action.coordinateSpace ?? options.defaultCoordinateSpace,
            state,
          );
          await executor.click(
            point.x,
            point.y,
            action.button ?? "left",
            1,
            normalizeModifierKeys(action.keys),
          );
          break;
        }
        case "double_click": {
          await assertFrontmostAppAllowed(executor, state);
          const point = toDisplayPoint(
            { x: action.x, y: action.y },
            action.coordinateSpace ?? options.defaultCoordinateSpace,
            state,
          );
          await executor.click(
            point.x,
            point.y,
            action.button ?? "left",
            2,
            normalizeModifierKeys(action.keys),
          );
          break;
        }
        case "move": {
          await assertFrontmostAppAllowed(executor, state);
          const point = toDisplayPoint(
            { x: action.x, y: action.y },
            action.coordinateSpace ?? options.defaultCoordinateSpace,
            state,
          );
          await executor.moveMouse(point.x, point.y);
          break;
        }
        case "scroll": {
          await assertFrontmostAppAllowed(executor, state);
          const point = toDisplayPoint(
            { x: action.x, y: action.y },
            action.coordinateSpace ?? options.defaultCoordinateSpace,
            state,
          );
          const dx = action.dx ?? action.scrollX ?? action.scroll_x ?? 0;
          const dy = action.dy ?? action.scrollY ?? action.scroll_y ?? 0;
          await executor.scroll(point.x, point.y, dx, dy);
          break;
        }
        case "drag": {
          await assertFrontmostAppAllowed(executor, state);
          const space = action.coordinateSpace ?? options.defaultCoordinateSpace;
          const path = action.path;
          if (path && path.length >= 2) {
            const [first, ...rest] = path.map((point) =>
              toDisplayPoint(point, space, state),
            );
            await executor.moveMouse(first!.x, first!.y);
            await executor.mouseDown();
            try {
              for (const next of rest) {
                await executor.moveMouse(next.x, next.y);
              }
            } finally {
              await executor.mouseUp();
            }
          } else {
            const to = action.to ?? (path?.length === 1 ? path[0] : undefined);
            if (!to) throw new Error("drag requires path with at least two points or a to point.");
            await executor.drag(
              action.from ? toDisplayPoint(action.from, space, state) : undefined,
              toDisplayPoint(to, space, state),
            );
          }
          break;
        }
        case "type":
          await assertFrontmostAppAllowed(executor, state);
          await executor.type(action.text, { viaClipboard: action.viaClipboard ?? true });
          break;
        case "keypress": {
          await assertFrontmostAppAllowed(executor, state);
          const sequence = keysToSequence(action);
          const normalized = normalizeKeySequence(sequence);
          if (isSystemKeyCombo(normalized, executor.capabilities.platform)) {
            throw new Error(
              `Blocked system key combo "${sequence}". Authorize disruptive shortcuts explicitly in a future guarded flow.`,
            );
          }
          await executor.key(sequence, action.repeat);
          break;
        }
        case "wait": {
          const ms = action.ms ?? action.durationMs ?? ((action.seconds ?? 1) * 1000);
          await sleep(Math.max(0, ms));
          break;
        }
        case "screenshot":
          await executor.screenshot({
            allowedBundleIds: [...state.allowedApps.keys()],
            displayId: action.displayId ?? options.displayId,
          });
          break;
      }

      records.push({ index, type: action.type, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      records.push({ index, type: action.type, ok: false, message });
      throw new Error(`Action ${index} (${action.type}) failed: ${message}`);
    }
  }

  return records;
}
