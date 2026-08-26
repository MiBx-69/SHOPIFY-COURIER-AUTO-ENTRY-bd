"use client";

import { createClient } from "@/lib/supabase/client";

export type PasskeyRecord = {
  id: string;
  friendly_name?: string;
  created_at?: string;
  last_used_at?: string;
};

type PasskeyAuthResponse = {
  data: { session?: unknown; user?: unknown } | null;
  error: { message: string } | null;
};

/** Isolates Supabase's experimental passkey API from the rest of the app. */
export const passkeyService = {
  signIn: async (): Promise<PasskeyAuthResponse> => {
    const auth = createClient().auth as unknown as Record<string, Function>;
    if (typeof auth.signInWithPasskey === "function") {
      return auth.signInWithPasskey();
    }
    return { data: null, error: { message: "Passkeys are not supported on this client." } };
  },

  register: async (): Promise<{ data: unknown; error: { message: string } | null }> => {
    const auth = createClient().auth as unknown as Record<string, Function>;
    if (typeof auth.registerPasskey === "function") {
      return auth.registerPasskey();
    }
    return { data: null, error: { message: "Passkey registration is not available." } };
  },

  list: async (): Promise<{ data: PasskeyRecord[] | null; error: { message: string } | null }> => {
    const auth = createClient().auth as unknown as Record<string, Function>;
    if (typeof auth.listPasskeys === "function") {
      return auth.listPasskeys();
    }
    return { data: [], error: null };
  },

  rename: async (id: string, friendlyName: string): Promise<{ data: unknown; error: { message: string } | null }> => {
    const auth = createClient().auth as unknown as Record<string, Function>;
    if (typeof auth.updatePasskey === "function") {
      return auth.updatePasskey({ id, friendly_name: friendlyName });
    }
    return { data: null, error: null };
  },

  remove: async (id: string): Promise<{ data: unknown; error: { message: string } | null }> => {
    const auth = createClient().auth as unknown as Record<string, Function>;
    if (typeof auth.deletePasskey === "function") {
      return auth.deletePasskey(id);
    }
    return { data: null, error: null };
  },

  signOutOtherSessions: async () => createClient().auth.signOut({ scope: "others" })
};
