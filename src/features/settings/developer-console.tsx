"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Building, User, Mail, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  memberships: {
    user_id: string;
    role: string;
    profiles?: { full_name: string | null } | { full_name: string | null }[];
  }[];
}

export function DeveloperConsole() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  
  // New Org Form
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");

  useEffect(() => {
    fetchOrganizations();
  }, []);

  async function fetchOrganizations() {
    try {
      const res = await fetch("/api/developer/organizations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrgs(data.organizations || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/developer/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName,
          slug: orgSlug,
          owner_email: ownerEmail,
          owner_name: ownerName
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setIsCreating(false);
      setOrgName("");
      setOrgSlug("");
      setOwnerEmail("");
      setOwnerName("");
      fetchOrganizations(); // Refresh list
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-2xs">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2 border border-red-100">
          <ShieldAlert size={16} />
          {error}
        </div>
      )}

      {/* New Organization Form */}
      {isCreating ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h3 className="font-semibold text-slate-900 mb-4">Create New Organization & Invite Owner</h3>
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Organization Name</label>
                <div className="relative">
                  <Building size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    type="text"
                    placeholder="Acme Corp"
                    value={orgName}
                    onChange={(e) => {
                      setOrgName(e.target.value);
                      if (!orgSlug || orgSlug === orgName.toLowerCase().replace(/\s+/g, '-').slice(0, -1)) {
                        setOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Organization Slug</label>
                <input
                  required
                  type="text"
                  placeholder="acme-corp"
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Owner Email</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    type="email"
                    placeholder="owner@example.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Owner Name (Optional)</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsCreating(false)} disabled={busy} className="cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="bg-slate-900 text-white hover:bg-slate-800 cursor-pointer">
                {busy ? <Loader2 size={16} className="animate-spin mr-2" /> : "Create & Invite"}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Tenant Organizations</h3>
            <p className="text-xs text-slate-500">Currently hosting {orgs.length} organizations.</p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white hover:bg-slate-800 h-9 text-xs cursor-pointer">
            <Plus size={14} className="mr-1.5" /> New Organization
          </Button>
        </div>
      )}

      {/* Orgs List */}
      <div className="grid gap-4 md:grid-cols-2">
        {orgs.map((org) => {
          const ownerMembership = org.memberships.find(m => m.role === 'owner');
          let ownerNameStr = "Unknown";
          if (ownerMembership && ownerMembership.profiles) {
            if (Array.isArray(ownerMembership.profiles)) {
              ownerNameStr = ownerMembership.profiles[0]?.full_name || "Unknown";
            } else {
              ownerNameStr = ownerMembership.profiles.full_name || "Unknown";
            }
          }
          
          return (
            <div key={org.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-slate-900">{org.name}</h3>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                    {org.slug}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-4 text-xs text-slate-600">
                  <Crown size={13} className="text-amber-500" />
                  Owner: <span className="font-medium text-slate-800">{ownerNameStr}</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-slate-600">
                  <Users size={13} className="text-blue-500" />
                  Members: <span className="font-medium text-slate-800">{org.memberships.length}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 text-[10px] text-slate-400">
                Created: {new Date(org.created_at).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Crown({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
    </svg>
  );
}
