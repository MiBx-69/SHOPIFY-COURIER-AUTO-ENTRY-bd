"use client";
import { createClient } from "@/lib/supabase/client";

/** Isolates Supabase's experimental passkey API from the rest of the app. */
export const passkeyService = {
  signIn: () => createClient().auth.signInWithPasskey(),
  register: () => createClient().auth.registerPasskey(),
  list: () => createClient().auth.listPasskeys(),
  rename: (id: string, friendlyName: string) => createClient().auth.updatePasskey({ id, friendly_name: friendlyName }),
  remove: (id: string) => createClient().auth.deletePasskey(id),
  signOutOtherSessions: () => createClient().auth.signOut({ scope: "others" })
};
