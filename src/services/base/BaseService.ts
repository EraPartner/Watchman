export interface ServiceConfig {
  name: string;
  baseUrl: string;
  authToken?: string;
  timeout?: number;
}

export interface ServiceHealth {
  status: 'online' | 'offline' | 'warning';
  responseTime?: number;
  lastCheck: Date;
  error?: string;
}

export interface ServiceStats {
  [key: string]: string | number | boolean;
}

export abstract class BaseService {
  protected config: ServiceConfig;
  protected lastHealth: ServiceHealth;

  constructor(config: ServiceConfig) {
    this.config = {
      timeout: 5000,
      ...config,
    };
    this.lastHealth = {
      status: 'offline',
      lastCheck: new Date(),
    };
  }

  abstract checkHealth(): Promise<ServiceHealth>;
  abstract getStats(): Promise<ServiceStats>;

  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.config.timeout}ms`);
        }
        throw error;
      }

      throw new Error('Unknown error occurred');
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.authToken) {
      headers.Authorization = `Basic ${this.config.authToken}`;
    }

    return headers;
  }

  getConfig(): ServiceConfig {
    return { ...this.config };
  }
}