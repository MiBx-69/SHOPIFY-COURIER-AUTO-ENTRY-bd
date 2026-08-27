"use client";

import { useState, useCallback } from "react";
import { Users, UserPlus, Loader2, CheckCircle2, AlertCircle, Crown, Shield, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Member {
  id: string;
  user_id: string;
  role: string;
  email?: string;
  full_name?: string;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface Props {
  organizationId: string;
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
  currentUserRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  dispatcher: "Dispatcher",
  viewer: "Viewer",
};

function RoleIcon({ role }: { role: string }) {
  if (role === "owner") return <Crown size={12} className="text-amber-500" />;
  if (role === "admin") return <Shield size={12} className="text-blue-500" />;
  return <User size={12} className="text-slate-400" />;
}

export function TeamSettings({ organizationId, members, invitations: initialInvitations, currentUserId, currentUserRole }: Props) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "dispatcher" | "viewer" | "admin" | "staff">("staff");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [inviteError, setInviteError] = useState("");
  const [invitations, setInvitations] = useState(initialInvitations);

  const canManage = ["owner", "admin", "developer"].includes(currentUserRole);

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.includes("@")) {
      setInviteError("Enter a valid email address.");
      return;
    }
    setInviteStatus("loading");
    setInviteError("");
    try {
      const res = await fetch(`/api/auth/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, organization_id: organizationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invitation failed");
      setInviteStatus("success");
      setInviteEmail("");
      
      // Optimistically add to list
      setInvitations([{
        id: data.invitation_id || Math.random().toString(),
        email: inviteEmail,
        role: inviteRole,
        status: "pending",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
      }, ...invitations]);

      setTimeout(() => setInviteStatus("idle"), 4000);
    } catch (err) {
      setInviteStatus("error");
      setInviteError(err instanceof Error ? err.message : "Failed to send invitation.");
    }
  }, [inviteEmail, inviteRole, organizationId, invitations]);

  const handleRevoke = async (invitationId: string) => {
    try {
      await fetch(`/api/auth/invite/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitation_id: invitationId }),
      });
      setInvitations(invitations.map(inv => inv.id === invitationId ? { ...inv, status: 'revoked' } : inv));
    } catch (err) {
      console.error(err);
    }
  };

  const handleResend = async (invitationId: string) => {
    try {
      await fetch(`/api/auth/invite/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitation_id: invitationId }),
      });
      alert("Invitation resent!");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-5">
      {/* Members list */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-4">
          <Users size={15} className="text-slate-400" />
          <h3 className="font-semibold text-sm text-slate-900">Team Members ({members.length})</h3>
        </div>
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-slate-600">
                    {(m.full_name || m.email || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {m.full_name || m.email || "Invited User"}
                    {m.user_id === currentUserId && (
                      <span className="ml-1.5 text-[10px] font-mono text-slate-400">(you)</span>
                    )}
                  </p>
                  {m.full_name && m.email && (
                    <p className="text-[11px] text-slate-400 truncate">{m.email}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                  <RoleIcon role={m.role} />
                  {ROLE_LABELS[m.role] ?? m.role}
                </span>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-xs text-slate-400 py-4 text-center">No team members found.</p>
          )}

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="pt-4 mt-4 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Invitations</h4>
              <div className="space-y-2">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{inv.email}</p>
                      <p className="text-[11px] text-slate-500 capitalize">{inv.role} · {inv.status}</p>
                    </div>
                    {inv.status === 'pending' && canManage && (
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleResend(inv.id)} className="text-[11px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                          Resend
                        </button>
                        <button onClick={() => handleRevoke(inv.id)} className="text-[11px] font-medium text-red-600 hover:text-red-700 cursor-pointer">
                          Revoke
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invite member */}
      {canManage && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={15} className="text-slate-400" />
            <h3 className="font-semibold text-sm text-slate-900">Invite Team Member</h3>
          </div>
          <div className="space-y-3">
            <input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <div className="relative">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full appearance-none text-sm rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {["owner", "developer"].includes(currentUserRole) && <option value="admin">Admin — full access except ownership</option>}
                <option value="staff">Staff — standard access</option>
                <option value="viewer">Viewer — read-only access</option>
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {inviteError && (
              <p className="text-[11px] text-red-600 flex items-center gap-1">
                <AlertCircle size={11} /> {inviteError}
              </p>
            )}
            {inviteStatus === "success" && (
              <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={11} /> Invitation sent! They will receive an email to join.
              </p>
            )}

            <Button
              className="w-full h-9 text-xs bg-slate-900 text-white min-h-9"
              onClick={handleInvite}
              disabled={inviteStatus === "loading"}
            >
              {inviteStatus === "loading" ? (
                <Loader2 size={12} className="animate-spin mr-1.5" />
              ) : (
                <UserPlus size={12} className="mr-1.5" />
              )}
              Send Invitation
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
