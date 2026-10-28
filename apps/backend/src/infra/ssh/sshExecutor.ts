export interface SshExecRequest {
  host: string;
  port: number;
  user: string;
  privateKeyPath?: string;
  passphrase?: string;
  password?: string;
  /** Pinned host-key fingerprint ("SHA256:…", as `ssh-keygen -lf` prints).
   *  When set, a server presenting any other host key is refused. */
  hostKey?: string;
  command: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SshExecutor {
  exec(req: SshExecRequest): Promise<SshExecResult>;
}
