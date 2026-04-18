import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { promises as nodeFs } from 'node:fs';
import nodePath from 'node:path';
import type { TcpProber } from '../net/tcpProbe.js';
import type { Logger } from '../../core/logger.js';

export interface TorConfig {
  torPath: string;
  socksPort: number;
  controlPort: number;
  dataDir: string;
  startupTimeoutMs: number;
  probeTimeoutMs: number;
  stopGraceMs: number;
}

export interface SpawnLike {
  (command: string, args: readonly string[], options?: SpawnOptions): ChildProcess;
}

export interface FsLike {
  mkdir(p: string, opts: { recursive: true }): Promise<unknown>;
  writeFile(p: string, data: string): Promise<void>;
  unlink(p: string): Promise<void>;
}

export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface TorManagerDeps {
  config: TorConfig;
  spawn?: SpawnLike;
  fs?: FsLike;
  tcpProber: TcpProber;
  logger: Logger;
  clock?: Clock;
}

export interface TorHealth {
  status: 'online' | 'offline';
  port: number;
  isManaged: boolean;
  lastCheck: string;
}

export interface TorManager {
  initialize(): Promise<boolean>;
  isInstalled(): Promise<boolean>;
  installTor(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  createTorConfig(): Promise<string>;
  startTor(): Promise<boolean>;
  stopTor(): Promise<void>;
  cleanup(): Promise<void>;
  checkHealth(): Promise<TorHealth>;
}

const defaultClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const defaultFs: FsLike = {
  mkdir: (p, opts) => nodeFs.mkdir(p, opts),
  writeFile: (p, data) => nodeFs.writeFile(p, data),
  unlink: (p) => nodeFs.unlink(p),
};

function runExitCode(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

export function createTorManager(deps: TorManagerDeps): TorManager {
  const { config, tcpProber, logger } = deps;
  const spawn = deps.spawn ?? (nodeSpawn as unknown as SpawnLike);
  const fs = deps.fs ?? defaultFs;
  const clock = deps.clock ?? defaultClock;

  let torProcess: ChildProcess | null = null;
  let isStarting = false;

  const torrcPath = () => nodePath.join(config.dataDir, 'torrc');

  const isRunning = () =>
    tcpProber.probe({ host: '127.0.0.1', port: config.socksPort, timeoutMs: config.probeTimeoutMs });

  const isInstalled = async (): Promise<boolean> => {
    const which = spawn('which', ['tor'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const code = await runExitCode(which);
    if (code === 0) return true;
    const brew = spawn('brew', ['list', 'tor'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const brewCode = await runExitCode(brew);
    return brewCode === 0;
  };

  const installTor = async (): Promise<boolean> => {
    logger.info('installing tor via brew');
    const child = spawn('brew', ['install', 'tor'], { stdio: 'inherit' });
    const code = await runExitCode(child);
    if (code === 0) {
      logger.info('tor installed');
      return true;
    }
    logger.error('tor install failed');
    return false;
  };

  const createTorConfig = async (): Promise<string> => {
    const content = [
      '# Tor configuration for Watchman',
      `SocksPort ${config.socksPort}`,
      `ControlPort ${config.controlPort}`,
      `DataDirectory ${config.dataDir}`,
      'Log notice stdout',
    ].join('\n');
    await fs.mkdir(config.dataDir, { recursive: true });
    const p = torrcPath();
    await fs.writeFile(p, content);
    return p;
  };

  const stopTor = async (): Promise<void> => {
    const proc = torProcess;
    if (!proc) return;
    torProcess = null;
    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      proc.once('exit', done);
      setTimeout(() => {
        if (!settled) {
          if (proc.exitCode === null && !proc.killed) proc.kill('SIGKILL');
          done();
        }
      }, config.stopGraceMs);
    });
  };

  const startTor = async (): Promise<boolean> => {
    if (isStarting) return false;
    if (await isRunning()) return true;
    isStarting = true;
    try {
      if (!(await isInstalled())) {
        const installed = await installTor();
        if (!installed) throw new Error('tor not installed');
      }
      const configPath = await createTorConfig();
      torProcess = spawn(config.torPath, ['-f', configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
      torProcess.once('error', (error: Error) => {
        logger.error({ err: error.message }, 'tor process error');
      });
      torProcess.once('exit', () => {
        torProcess = null;
      });

      const started = clock.now();
      let delay = 250;
      while (clock.now() - started < config.startupTimeoutMs) {
        if (await isRunning()) {
          isStarting = false;
          return true;
        }
        await clock.sleep(delay);
        delay = Math.min(delay * 2, 1000);
      }
      throw new Error('tor startup timeout');
    } catch (e) {
      logger.error({ err: e instanceof Error ? e.message : String(e) }, 'tor start failed');
      isStarting = false;
      await stopTor();
      return false;
    }
  };

  const cleanup = async (): Promise<void> => {
    await stopTor();
    await fs.unlink(torrcPath()).catch(() => undefined);
  };

  const initialize = async (): Promise<boolean> => {
    try {
      await isInstalled();
      return true;
    } catch {
      return false;
    }
  };

  const checkHealth = async (): Promise<TorHealth> => ({
    status: (await isRunning()) ? 'online' : 'offline',
    port: config.socksPort,
    isManaged: torProcess !== null,
    lastCheck: new Date().toISOString(),
  });

  return {
    initialize,
    isInstalled,
    installTor,
    isRunning,
    createTorConfig,
    startTor,
    stopTor,
    cleanup,
    checkHealth,
  };
}
