// Server-only typed access to Paige's service credentials.
// Import from server code (route handlers, scripts, the agent) — never client components.

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Read a required env var, throwing early (with a helpful pointer) if it's missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (see .env.example)`);
  }
  return value;
}

export const env = {
  livekit: {
    url: optional("LIVEKIT_URL"),
    apiKey: optional("LIVEKIT_API_KEY"),
    apiSecret: optional("LIVEKIT_API_SECRET"),
    publicUrl: optional("NEXT_PUBLIC_LIVEKIT_URL"),
  },
  moss: {
    projectId: optional("MOSS_PROJECT_ID"),
    projectKey: optional("MOSS_PROJECT_KEY"),
    index: optional("MOSS_INDEX"),
  },
  unsiloed: { apiKey: optional("UNSILOED_API_KEY") },
  truefoundry: {
    apiKey: optional("TRUEFOUNDRY_API_KEY"),
    baseUrl: optional("TRUEFOUNDRY_BASE_URL"),
    model: optional("TRUEFOUNDRY_MODEL"),
  },
  minimax: { apiKey: optional("MINIMAX_API_KEY") },
  qwen: { apiKey: optional("QWEN_API_KEY") },
};
