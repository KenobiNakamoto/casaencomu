// The bridge is plain `.mjs` so the server can run it with `node` and no build step; these are the
// two pure pieces its test drives.
export function promptFor(body: unknown, files?: string[]): string;
export function parseJson(text: unknown): Record<string, unknown> | null;
