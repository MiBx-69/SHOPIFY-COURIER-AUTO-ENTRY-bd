import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { invitation_id } = body;

    if (!invitation_id) {
      return NextResponse.json({ error: "Missing invitation_id" }, { status: 400 });
    }

    // 1. Fetch the invitation to verify organization
    const { data: invitation, error: fetchError } = await supabase
      .from('organization_invitations')
      .select('organization_id, email, status, role')
      .eq('id', invitation_id)
      .single();

    if (fetchError || !invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: "Only pending invitations can be resent" }, { status: 400 });
    }

    const isDeveloper = user.user_metadata?.app_role === 'developer';

    // 2. Authorization Check (if not developer, must be admin/owner of the org)
    if (!isDeveloper) {
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .select('role')
        .eq('organization_id', invitation.organization_id)
        .eq('user_id', user.id)
        .single();

      if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
        return NextResponse.json({ error: "Insufficient permissions to manage invitations in this organization" }, { status: 403 });
      }
    }

    // 3. Send Supabase Auth Invitation using Admin Client
    const adminSupabase = createAdminClient();
    const { error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(invitation.email, {
      data: {
        organization_id: invitation.organization_id,
        app_role: invitation.role
      },
      redirectTo: `${new URL(request.url).origin}/auth/callback`
    });

    if (inviteError) {
      return NextResponse.json({ error: "Failed to resend invitation email via Supabase" }, { status: 500 });
    }

    // 4. Update the invitation expiration
    await supabase
      .from('organization_invitations')
      .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', invitation_id);

    // 5. Audit Log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      actor_role: user.user_metadata?.app_role || 'staff',
      action: 'INVITATION_RESENT',
      target_organization_id: invitation.organization_id,
      metadata: { invitation_id, email: invitation.email }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
