import { type ParsedRemoteWorkspaceUri } from "./types.js";

/**
 * Faz parse robusto de URIs no formato ssh://user@host:port/remote/path ou ssh://host/path
 */
export function parseRemoteWorkspaceUri(uriString: string): ParsedRemoteWorkspaceUri {
  if (!uriString || !uriString.startsWith("ssh://")) {
    throw new Error(`Invalid remote workspace URI. Expected format 'ssh://[user@]host[:port]/path', got: ${uriString}`);
  }

  try {
    // Normaliza para URL padrão
    const parsed = new URL(uriString);
    const username = parsed.username || process.env.USER || "root";
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 22;
    let remotePath = parsed.pathname || "/";

    if (!host) {
      throw new Error(`Missing host in URI: ${uriString}`);
    }

    // Garante que o path remoto é absoluto
    if (!remotePath.startsWith("/")) {
      remotePath = `/${remotePath}`;
    }

    return {
      raw: uriString,
      protocol: "ssh",
      username,
      host,
      port,
      remotePath,
    };
  } catch (err: unknown) {
    throw new Error(`Failed to parse remote workspace URI '${uriString}': ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Formata URI a partir dos componentes
 */
export function formatRemoteWorkspaceUri(components: {
  username?: string;
  host: string;
  port?: number;
  remotePath: string;
}): string {
  const user = components.username ? `${components.username}@` : "";
  const port = components.port && components.port !== 22 ? `:${components.port}` : "";
  const cleanPath = components.remotePath.startsWith("/") ? components.remotePath : `/${components.remotePath}`;
  return `ssh://${user}${components.host}${port}${cleanPath}`;
}
