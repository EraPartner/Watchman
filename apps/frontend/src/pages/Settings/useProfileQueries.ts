import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  profilesApi,
  type ActiveProfileState,
  type CurrentNetwork,
  type Profile,
  type ProfileInput,
} from "../../services/profilesApi";
import { configApi } from "../../services/configApi";
import { queryKeys } from "@/lib/queryKeys";

// Switching/mutating profiles changes which services the backend monitors, so
// refresh the dashboard families alongside the profile families.
function invalidateAll(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: queryKeys.profiles() });
  qc.invalidateQueries({ queryKey: queryKeys.activeProfile() });
  qc.invalidateQueries({ queryKey: queryKeys.currentNetwork() });
  qc.invalidateQueries({ queryKey: queryKeys.servicesInstances() });
  qc.invalidateQueries({ queryKey: queryKeys.servicesHealth() });
  qc.invalidateQueries({ queryKey: ["config", "services"] });
}

export function useProfiles() {
  return useQuery<Profile[]>({
    queryKey: queryKeys.profiles(),
    queryFn: () => profilesApi.list(),
  });
}

export function useActiveProfile() {
  return useQuery<ActiveProfileState>({
    queryKey: queryKeys.activeProfile(),
    queryFn: () => profilesApi.getActive(),
  });
}

export function useCurrentNetwork() {
  return useQuery<CurrentNetwork>({
    queryKey: queryKeys.currentNetwork(),
    queryFn: () => profilesApi.getCurrentNetwork(),
    staleTime: 15_000,
  });
}

export function useSetActiveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => profilesApi.setActive(profileId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetAutoSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (autoSwitch: boolean) => profilesApi.setAutoSwitch(autoSwitch),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.activeProfile() }),
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => profilesApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profiles() }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ProfileInput> }) =>
      profilesApi.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profiles() }),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => profilesApi.remove(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCaptureNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => profilesApi.captureNetwork(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles() });
      qc.invalidateQueries({ queryKey: queryKeys.currentNetwork() });
    },
  });
}

export function useMoveServiceProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profileId }: { id: string; profileId: string }) =>
      configApi.moveServiceProfile(id, profileId),
    onSuccess: () => invalidateAll(qc),
  });
}
