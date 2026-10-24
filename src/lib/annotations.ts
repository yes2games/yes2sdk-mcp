/**
 * The metadata every docs and validation tool shares: a human-readable title
 * and the annotation hints. None of them writes to the consumer filesystem or
 * calls the network, so the hints are the same for all of them. The dashboard
 * tools are the exception and use dashboardTool() below.
 *
 * The title is deliberately emitted twice. `Tool.title` is where the current
 * spec puts it, but the Claude connector review scanner reads the older
 * `annotations.title` and reports "Missing annotations: title" when only the
 * top-level field is set. Both come from this one argument so they cannot drift.
 */
export function readOnlyTool(title: string) {
  return {
    title,
    annotations: {
      title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
}

/**
 * The metadata for a dashboard tool: it calls the Yes2 dashboard API with the
 * caller's own key, so it is open-world, and it may change the studio's data.
 * The hints differ per tool, so each one states them rather than inheriting a
 * shared default. Only a tool that can delete something the user cannot get
 * back (set_game_image with remove) is marked destructive.
 */
export function dashboardTool(
  title: string,
  hints: { readOnly: boolean; idempotent: boolean; destructive?: boolean },
) {
  return {
    title,
    annotations: {
      title,
      readOnlyHint: hints.readOnly,
      destructiveHint: hints.destructive ?? false,
      idempotentHint: hints.idempotent,
      openWorldHint: true,
    },
  };
}
