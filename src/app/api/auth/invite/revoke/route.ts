import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
      .select('organization_id, email, status')
      .eq('id', invitation_id)
      .single();

    if (fetchError || !invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: "Only pending invitations can be revoked" }, { status: 400 });
    }

    const isDeveloper = user.app_metadata?.app_role === 'developer';

    // 2. Authorization Check (if not developer, must be admin/owner of the org)
    if (!isDeveloper) {
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .select('role')
        .eq('organization_id', invitation.organization_id)
        .eq('user_id', user.id)
        .single();

      if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
        return NextResponse.json({ error: "Insufficient permissions to revoke invitations in this organization" }, { status: 403 });
      }
    }

    // 3. Update the invitation status
    const { error: updateError } = await supabase
      .from('organization_invitations')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', invitation_id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to revoke invitation" }, { status: 500 });
    }

    // 4. Audit Log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      actor_role: user.app_metadata?.app_role || 'staff',
      action: 'INVITATION_REVOKED',
      target_organization_id: invitation.organization_id,
      metadata: { invitation_id, email: invitation.email }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
