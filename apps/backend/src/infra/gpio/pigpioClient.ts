export interface PigpioHandle {
  read(gpio: number): Promise<number>;
  getHardwareRevision(): Promise<number>;
  getPigpioVersion(): Promise<number>;
  getCurrentTick(): Promise<number>;
  end(): Promise<void>;
}

export interface PigpioClientRequest {
  host: string;
  port: number;
  timeoutMs: number;
}

export interface PigpioClient {
  connect(req: PigpioClientRequest): Promise<PigpioHandle>;
}
