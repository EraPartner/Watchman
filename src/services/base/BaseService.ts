export interface ServiceConfig {
  name: string;
  baseUrl: string;
  authToken?: string; // Base64 encoded auth string
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
      console.log(`🔗 Making request to: ${url}`);

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
        const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        console.error(`❌ Request failed: ${errorMessage} for ${url}`);
        throw new Error(errorMessage);
      }

      console.log(`✅ Request successful: ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const timeoutError = new Error(
            `Request timeout after ${this.config.timeout}ms for ${url}`
          );
          console.error(`⏰ ${timeoutError.message}`);
          throw timeoutError;
        }
        console.error(`❌ Request error for ${url}:`, error.message);
        throw error;
      }

      const unknownError = new Error(`Unknown error occurred for ${url}`);
      console.error(`❌ ${unknownError.message}`);
      throw unknownError;
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

  getLastHealth(): ServiceHealth {
    return { ...this.lastHealth };
  }
}