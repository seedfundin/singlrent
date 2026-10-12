"use client";

import { useAppNavigation } from "@/features/app/app-provider";
import { ProfileSettings } from "@/features/users/profile-settings";

export default function ProfileSettingsPage() {
  const { go } = useAppNavigation();
  return <ProfileSettings go={go} />;
}
