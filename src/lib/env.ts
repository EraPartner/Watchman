// Environment variable validation and type safety
interface Env {
  VITE_BACKEND_URL: string;
  VITE_FRONTEND_PORT?: string;
}

class EnvValidator {
  private static instance: EnvValidator;
  private env: Env;

  private constructor() {
    this.env = this.validateEnv();
  }

  public static getInstance(): EnvValidator {
    if (!EnvValidator.instance) {
      EnvValidator.instance = new EnvValidator();
    }
    return EnvValidator.instance;
  }

  private validateEnv(): Env {
    const requiredVars = ['VITE_BACKEND_URL'];
    const missing = requiredVars.filter(key => !import.meta.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate URL format
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    try {
      new URL(backendUrl);
    } catch {
      throw new Error(`VITE_BACKEND_URL must be a valid URL, got: ${backendUrl}`);
    }

    return {
      VITE_BACKEND_URL: backendUrl,
      VITE_FRONTEND_PORT: import.meta.env.VITE_FRONTEND_PORT,
    };
  }

  public get(key: keyof Env): string | undefined {
    return this.env[key];
  }

  public getRequired(key: keyof Env): string {
    const value = this.env[key];
    if (!value) {
      throw new Error(`Environment variable ${key} is required but not set`);
    }
    return value;
  }
}

export const env = EnvValidator.getInstance();