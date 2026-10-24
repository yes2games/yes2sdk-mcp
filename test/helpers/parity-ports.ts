/**
 * Fixed ports for the phase 1 parity run. The stub dashboard's URL appears in
 * some tool output (set_game_image's curl command), so it must be the same
 * when the fixture is recorded and when it is replayed.
 */
export const PARITY_PORTS = { stub: 8093, server: 8094 } as const;
