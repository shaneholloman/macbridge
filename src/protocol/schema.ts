import { z } from "zod";
import type { Action, Expectation, ObserveInput, PlannedAction } from "./types.js";

export const CoordSchema = z.enum(["pixel", "normalized", "global"]);

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
  coord: CoordSchema.optional(),
});

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const TargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("window"), wid: z.number().int().nonnegative() }),
  z
    .object({
      kind: z.literal("app"),
      name: z.string().optional(),
      bundleID: z.string().optional(),
      pid: z.number().int().nonnegative().optional(),
    })
    .refine((target) => target.name != null || target.bundleID != null || target.pid != null, {
      message: "app target needs name, bundleID, or pid",
    }),
  z.object({
    kind: z.literal("display"),
    display: z.union([z.literal("main"), z.number(), z.string()]),
  }),
  z.object({ kind: z.literal("desktop") }),
]);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activate"), target: TargetSchema }),
  z.object({ type: z.literal("click"), target: TargetSchema, point: PointSchema }),
  z.object({
    type: z.literal("type"),
    target: TargetSchema,
    text: z.string(),
    at: PointSchema.optional(),
    replace: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("paste"),
    target: TargetSchema,
    text: z.string(),
    at: PointSchema.optional(),
    activate: z.boolean().optional(),
    submit: z.boolean().optional(),
    preserveClipboard: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("press"),
    target: TargetSchema,
    key: z.string(),
    modifiers: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("axAction"),
    target: TargetSchema,
    point: PointSchema,
    action: z.string(),
  }),
  z.object({ type: z.literal("setFrame"), target: TargetSchema, frame: RectSchema }),
  z.object({
    type: z.literal("maximize"),
    target: TargetSchema,
    display: z.union([z.string(), z.number()]).optional(),
    margin: z.number().optional(),
  }),
  z.object({ type: z.literal("command"), argv: z.array(z.string()).min(1) }),
]);

export const ExpectationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("artifact"),
    path: z.string().min(1),
    minBytes: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("windowTitle"),
    target: TargetSchema,
    match: z.string().min(1),
    flags: z.string().optional(),
  }),
  z.object({
    type: z.literal("permissions"),
    ok: z.boolean().optional(),
  }),
]);

export const RedactionOptionsSchema = z.object({
  maxDepth: z.number().int().nonnegative().optional(),
  maxArrayItems: z.number().int().nonnegative().optional(),
});

export const ObserveInputSchema = z.object({
  target: TargetSchema,
  targetScreenshot: z.boolean().optional(),
  displayScreenshot: z
    .union([
      z.boolean(),
      z.object({ display: z.union([z.literal("main"), z.number(), z.string()]).optional() }),
    ])
    .optional(),
  accessibility: z.union([z.boolean(), PointSchema]).optional(),
  redactedSummary: z.union([z.boolean(), RedactionOptionsSchema]).optional(),
  outDir: z.string().min(1).optional(),
  requirePermissions: z.boolean().optional(),
  promptPermissions: z.boolean().optional(),
});

export const PlannedActionSchema = z.object({
  action: ActionSchema,
  reason: z.string().optional(),
  expect: ExpectationSchema.optional(),
});

export function parseAction(value: unknown): Action {
  return ActionSchema.parse(value) as Action;
}

export function parseExpectation(value: unknown): Expectation {
  return ExpectationSchema.parse(value) as Expectation;
}

export function parseObserveInput(value: unknown): ObserveInput {
  return ObserveInputSchema.parse(value) as ObserveInput;
}

export function parsePlan(value: unknown): PlannedAction {
  return PlannedActionSchema.parse(value) as PlannedAction;
}
