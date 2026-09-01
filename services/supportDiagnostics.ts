const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export interface SupportDiagnosticsInput {
  appVersion?: string;
  connectionUrl?: string | null;
  connectionStatus: string;
  connectionErrorCode?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  revision?: number | null;
  activeHostIdentity?: string | null;
  writerStatus?: string | null;
  project?: { id: string; draftVersion?: number } | null;
  providerStatus?: string;
}

export interface SupportDiagnostics {
  schemaVersion: 1;
  generatedAt: string;
  app: { version: string; online: boolean; platform: string };
  runtime: { status: string; endpoint: string };
  host: { identity: string | null; writerStatus: string | null; clientId: string | null };
  project: { id: string | null; revision: number | null; draftVersion: number | null };
  provider: { status: string };
  recentErrorCodes: string[];
}

function loopbackOrigin(value: string | null | undefined) {
  if (!value) return 'not-connected';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) ? url.origin : 'redacted';
  } catch {
    return 'redacted';
  }
}

function browserValue(read: () => string, fallback: string) {
  try {
    return read() || fallback;
  } catch {
    return fallback;
  }
}

export function buildSupportDiagnostics(input: SupportDiagnosticsInput): SupportDiagnostics {
  const projectId = input.projectId || input.project?.id || null;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    app: {
      version: input.appVersion || 'development',
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      platform: typeof navigator === 'undefined' ? 'unknown' : browserValue(() => navigator.platform, 'unknown'),
    },
    runtime: {
      status: input.connectionStatus,
      endpoint: loopbackOrigin(input.connectionUrl),
    },
    host: {
      identity: input.activeHostIdentity || null,
      writerStatus: input.writerStatus || null,
      clientId: input.clientId || null,
    },
    project: {
      id: projectId,
      revision: input.revision ?? null,
      draftVersion: input.project?.draftVersion ?? null,
    },
    provider: { status: input.providerStatus || 'not-observed' },
    recentErrorCodes: [input.connectionErrorCode].filter((code): code is string => Boolean(code)),
  };
}

export function serializeSupportDiagnostics(input: SupportDiagnosticsInput) {
  return JSON.stringify(buildSupportDiagnostics(input), null, 2);
}
