/**
 * The metadata every tool in this server shares: a human-readable title and the
 * annotation hints. No tool here writes to the consumer filesystem or calls the
 * network, so the hints are the same for all of them.
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
