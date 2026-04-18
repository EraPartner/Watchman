export interface SshExecRequest {
  host: string;
  port: number;
  user: string;
  privateKeyPath?: string;
  passphrase?: string;
  password?: string;
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
