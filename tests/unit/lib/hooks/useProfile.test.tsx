import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useProfile } from "@/lib/hooks/useProfile";

describe("useProfile", () => {
  it("returns local user profile and dummy mutations without throwing", async () => {
    const { result } = renderHook(() => useProfile());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.profile.id).toBe("local_user");
    expect(result.current.profile.display_name).toBe("Local User");

    await expect(
      result.current.updateProfile.mutateAsync({ timezone: "Europe/Berlin" }),
    ).resolves.toBeUndefined();

    await expect(
      result.current.updateSettings.mutateAsync({
        notifications: {
          morning_briefing: false,
        },
      }),
    ).resolves.toBeUndefined();
  });
});
