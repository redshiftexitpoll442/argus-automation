/**
 * Mouse & keyboard input module — wraps robotjs.
 *
 * Equivalent of @ant/computer-use-input (Rust enigo library).
 * Uses robotjs for SendInput on Windows.
 */

import robotjs from "robotjs";

// ── Configuration ───────────────────────────────────────────────────────────

// Set minimal delays for responsive automation
robotjs.setMouseDelay(0);
robotjs.setKeyboardDelay(0);

// ── Key mapping ─────────────────────────────────────────────────────────────

/**
 * Map Chicago MCP key names to robotjs key names.
 * robotjs uses lowercase, no aliases. This handles common mismatches.
 */
const KEY_MAP: Record<string, string> = {
  // Modifier aliases → robotjs names
  command: "command",
  cmd: "command",
  meta: "command",      // robotjs uses "command" for Win key on Windows
  windows: "command",
  win: "command",
  ctrl: "control",
  control: "control",
  alt: "alt",
  option: "alt",
  shift: "shift",

  // Special keys
  return: "enter",
  enter: "enter",
  escape: "escape",
  esc: "escape",
  backspace: "backspace",
  delete: "delete",
  tab: "tab",
  space: "space",

  // Arrow keys
  up: "up",
  down: "down",
  left: "left",
  right: "right",

  // Function keys
  f1: "f1", f2: "f2", f3: "f3", f4: "f4",
  f5: "f5", f6: "f6", f7: "f7", f8: "f8",
  f9: "f9", f10: "f10", f11: "f11", f12: "f12",

  // Navigation
  home: "home",
  end: "end",
  pageup: "pageup",
  pagedown: "pagedown",

  // Other
  insert: "insert",
  printscreen: "printscreen",
  capslock: "capslock",
  numlock: "numlock",
  scrolllock: "scrolllock",
};

/**
 * Known modifier key names (lowercase).
 */
const MODIFIER_KEYS = new Set([
  "command", "cmd", "meta", "windows", "win",
  "ctrl", "control",
  "alt", "option",
  "shift",
]);

function mapKey(key: string): string {
  const lower = key.toLowerCase();
  return KEY_MAP[lower] ?? lower;
}

function isModifier(key: string): boolean {
  return MODIFIER_KEYS.has(key.toLowerCase());
}

/**
 * Extract modifier names from an array of key names.
 * Returns { modifiers, key } where modifiers is for robotjs format.
 */
function splitModifiersAndKey(
  parts: string[],
): { modifiers: string[]; key: string | null } {
  const mods: string[] = [];
  let mainKey: string | null = null;

  for (const p of parts) {
    if (isModifier(p)) {
      mods.push(mapKey(p));
    } else {
      mainKey = mapKey(p);
    }
  }

  return { modifiers: mods, key: mainKey };
}

// ── Public API ──────────────────────────────────────────────────────────────

// ── Mouse ───────────────────────────────────────────────────────────────────

export function moveMouse(x: number, y: number): void {
  robotjs.moveMouse(Math.round(x), Math.round(y));
}

export function getMousePos(): { x: number; y: number } {
  return robotjs.getMousePos();
}

export function mouseClick(
  button: "left" | "right" | "middle" = "left",
  count: number = 1,
): void {
  // robotjs.mouseClick only supports single and double click
  if (count === 1) {
    robotjs.mouseClick(button, false);
  } else if (count === 2) {
    robotjs.mouseClick(button, true);
  } else {
    // Triple click: do double + single
    robotjs.mouseClick(button, true);
    robotjs.mouseClick(button, false);
  }
}

export function mouseToggle(
  action: "press" | "release",
  button: "left" | "right" | "middle" = "left",
): void {
  const down = action === "press" ? "down" : "up";
  robotjs.mouseToggle(down, button);
}

export function scrollMouse(
  amount: number,
  direction: "up" | "down" | "left" | "right",
): void {
  // robotjs.scrollMouse(x, y) — x is horizontal, y is vertical
  // Positive y = down, negative y = up (OS-level)
  switch (direction) {
    case "up":
      robotjs.scrollMouse(0, -amount);
      break;
    case "down":
      robotjs.scrollMouse(0, amount);
      break;
    case "left":
      robotjs.scrollMouse(-amount, 0);
      break;
    case "right":
      robotjs.scrollMouse(amount, 0);
      break;
  }
}

export function dragMouse(x: number, y: number): void {
  robotjs.dragMouse(Math.round(x), Math.round(y));
}

// ── Keyboard ────────────────────────────────────────────────────────────────

/**
 * Press a key combo (e.g. "ctrl+shift+a"). Presses and releases in one shot.
 */
export function keyTap(keySequence: string): void {
  const parts = keySequence
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);

  const { modifiers, key } = splitModifiersAndKey(parts);

  if (key) {
    robotjs.keyTap(key, modifiers);
  } else if (modifiers.length > 0) {
    // Modifier-only sequence (e.g. just "shift") — press and release via toggle
    // robotjs.keyTap doesn't work with pure modifiers
    for (const m of modifiers) {
      robotjs.keyToggle(m, "down");
    }
    for (const m of modifiers.reverse()) {
      robotjs.keyToggle(m, "up");
    }
  }
}

/**
 * Toggle a single key press/release.
 */
export function keyToggle(
  key: string,
  action: "press" | "release",
  modifiers?: string[],
): void {
  const mapped = mapKey(key);
  const down = action === "press" ? "down" : "up";
  robotjs.keyToggle(
    mapped,
    down,
    modifiers?.map(mapKey) ?? [],
  );
}

/**
 * Type a string character by character.
 */
export function typeString(text: string): void {
  robotjs.typeString(text);
}

/**
 * Get the current screen size.
 */
export function getScreenSize(): { width: number; height: number } {
  return robotjs.getScreenSize();
}
