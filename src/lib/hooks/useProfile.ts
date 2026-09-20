"use client";

import {
  Profile,
  DEFAULT_USER_SETTINGS,
  EditableProfileFields,
  UserSettings,
} from "../types/profile";

type ProfilePatch = Partial<EditableProfileFields>;

type SettingsPatch = Partial<{
  notifications: Partial<NonNullable<UserSettings["notifications"]>>;
  adminLandingPage: UserSettings["adminLandingPage"];
}>;

const LOCAL_PROFILE: Profile = {
  id: "local_user",
  display_name: "Local User",
  timezone: "UTC",
  is_premium: true,
  is_admin: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  settings: DEFAULT_USER_SETTINGS,
};

export function useProfile(_options?: { enabled?: boolean }) {
  return {
    profile: LOCAL_PROFILE,
    isLoading: false,
    updateProfile: {
      mutate: async (_args?: ProfilePatch) => {},
      mutateAsync: async (_args?: ProfilePatch) => {},
      isPending: false,
    },
    updateSettings: {
      mutate: async (_args?: SettingsPatch) => {},
      mutateAsync: async (_args?: SettingsPatch) => {},
      isPending: false,
    },
  };
}
