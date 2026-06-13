import { sharedCore } from "./ApiClient";

export interface NetworkSignature {
  gatewayMac?: string;
  gatewayIp?: string;
  subnet?: string;
}

export interface CapturedSignature extends NetworkSignature {
  capturedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  networkSigs: CapturedSignature[];
  serviceCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileInput {
  name: string;
  description?: string;
  color?: string;
  networkSigs?: CapturedSignature[];
}

export interface ActiveProfileState {
  activeProfileId: string | null;
  autoSwitch: boolean;
}

export interface CurrentNetwork {
  signature: NetworkSignature;
  matchedProfileId: string | null;
}

const BASE = "";

function jsonBody(
  payload: unknown,
  method: "POST" | "PUT" = "POST"
): { method: "POST" | "PUT"; body: string; headers: Record<string, string> } {
  return {
    method,
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  };
}

export const profilesApi = {
  async list(): Promise<Profile[]> {
    return sharedCore.request(`${BASE}/profiles`);
  },

  async get(id: string): Promise<Profile> {
    return sharedCore.request(`${BASE}/profiles/${encodeURIComponent(id)}`);
  },

  async create(input: ProfileInput): Promise<Profile> {
    return sharedCore.request(`${BASE}/profiles`, jsonBody(input));
  },

  async update(id: string, patch: Partial<ProfileInput>): Promise<Profile> {
    return sharedCore.request(
      `${BASE}/profiles/${encodeURIComponent(id)}`,
      jsonBody(patch, "PUT")
    );
  },

  async remove(id: string): Promise<void> {
    await sharedCore.request(`${BASE}/profiles/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async getActive(): Promise<ActiveProfileState> {
    return sharedCore.request(`${BASE}/profiles/active`);
  },

  async setActive(profileId: string): Promise<{ activeProfileId: string }> {
    return sharedCore.request(
      `${BASE}/profiles/active`,
      jsonBody({ profileId }, "PUT")
    );
  },

  async setAutoSwitch(autoSwitch: boolean): Promise<{ autoSwitch: boolean }> {
    return sharedCore.request(
      `${BASE}/profiles/settings`,
      jsonBody({ autoSwitch }, "PUT")
    );
  },

  async getCurrentNetwork(): Promise<CurrentNetwork> {
    return sharedCore.request(`${BASE}/profiles/current-network`);
  },

  async captureNetwork(id: string): Promise<Profile> {
    return sharedCore.request(
      `${BASE}/profiles/${encodeURIComponent(id)}/capture-network`,
      {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};
