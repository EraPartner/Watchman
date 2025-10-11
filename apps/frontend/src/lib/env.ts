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

  private validateEnv(): Env {
    // VITE_BACKEND_URL is optional in development. If not provided, the client
    // will use relative endpoints and rely on the dev server proxy.
    const backendUrlRaw = import.meta.env.VITE_BACKEND_URL || "";
    let backendUrl = "";
    if (backendUrlRaw) {
      try {
        // Ensure it's a valid URL when provided
        new URL(backendUrlRaw);
        backendUrl = backendUrlRaw;
      } catch {
        throw new Error(
          `VITE_BACKEND_URL must be a valid URL when provided, got: ${backendUrlRaw}`,
        );
      }
    }

    return {
      VITE_BACKEND_URL: backendUrl,
      VITE_FRONTEND_PORT: import.meta.env.VITE_FRONTEND_PORT,
    };
  }
}

export const env = EnvValidator.getInstance();
