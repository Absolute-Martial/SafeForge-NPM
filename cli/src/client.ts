import type {
  AuditEventEnvelope,
  AuditReport,
  CliStatus,
  RegistryPrecheckResult,
  ScanRequest,
} from "./types.js";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return await response.json() as T;
}

export async function fetchCliStatus(apiUrl: string): Promise<CliStatus> {
  return await requestJson<CliStatus>(`${apiUrl}/cli/status`);
}

export async function fetchRegistryPrecheck(apiUrl: string, packageName: string, version: string): Promise<RegistryPrecheckResult> {
  const params = new URLSearchParams({ packageName, version });
  return await requestJson<RegistryPrecheckResult>(`${apiUrl}/registry/precheck?${params.toString()}`);
}

export async function startStreamingAudit(apiUrl: string, payload: ScanRequest): Promise<{ auditId: string }> {
  return await requestJson<{ auditId: string }>(`${apiUrl}/audit/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchAuditReport(apiUrl: string, auditId: string): Promise<AuditReport> {
  return await requestJson<AuditReport>(`${apiUrl}/audit/${auditId}/report`);
}

export async function fetchPublishedReport(reportUri: string): Promise<AuditReport | null> {
  const response = await fetch(reportUri, { headers: { accept: "application/json" } });
  if (!response.ok) {
    return null;
  }

  try {
    return await response.json() as AuditReport;
  } catch {
    return null;
  }
}

export async function streamAuditEvents(
  apiUrl: string,
  auditId: string,
  onEvent: (event: AuditEventEnvelope) => void | Promise<void>,
): Promise<void> {
  const response = await fetch(`${apiUrl}/audit/${auditId}/events`, {
    headers: { accept: "text/event-stream" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Unable to connect to audit event stream (${response.status})`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const parsed = parseSseFrame(frame);
      if (parsed) {
        await onEvent(parsed);
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const parsed = parseSseFrame(trailing);
    if (parsed) {
      await onEvent(parsed);
    }
  }
}

function parseSseFrame(frame: string): AuditEventEnvelope | null {
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
      data += `${line.slice(5).trimStart()}\n`;
    }
  }

  if (!data.trim()) {
    return null;
  }

  return JSON.parse(data) as AuditEventEnvelope;
}
