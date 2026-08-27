import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body", details: parsed.error.format() }, { status: 400 });
    }

    const { email, role, name, phone, company_name, organization_id } = parsed.data;

    const isDeveloper = user.app_metadata?.app_role === 'developer';

    // 1. Authorization Check (if not developer, must be admin/owner of the org)
    if (!isDeveloper) {
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .select('role')
        .eq('organization_id', organization_id)
        .eq('user_id', user.id)
        .single();

      if (membershipError || !membership || !['owner', 'admin'].includes(membership.role)) {
        return NextResponse.json({ error: "Insufficient permissions to invite users to this organization" }, { status: 403 });
      }
    }

    // 2. Insert the pending invitation via Admin client to bypass RLS if necessary, 
    // though the RLS policy allows admins and developers to manage invitations.
    // We will use the regular client to leverage RLS naturally.
    const { data: invitation, error: insertError } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id,
        email: email.toLowerCase(),
        role,
        name,
        phone,
        company_name,
        invited_by: user.id,
        status: 'pending'
      })
      .select('id')
      .single();

    if (insertError) {
      // If it's a unique constraint violation, there's already a pending invite
      if (insertError.code === '23505') {
        return NextResponse.json({ error: "A pending invitation already exists for this email in this organization." }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to create invitation record" }, { status: 500 });
    }

    // 3. Send Supabase Auth Invitation using Admin Client
    const adminSupabase = createAdminClient();
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: {
        organization_id
      },
      redirectTo: `${new URL(request.url).origin}/auth/callback`
    });

    if (inviteError) {
      // Rollback the pending invitation if email sending fails
      await adminSupabase.from('organization_invitations').delete().eq('id', invitation.id);
      return NextResponse.json({ error: "Failed to send invitation email via Supabase" }, { status: 500 });
    }
    
    if (inviteData?.user) {
      await adminSupabase.auth.admin.updateUserById(inviteData.user.id, {
        app_metadata: { app_role: role }
      });
    }

    // 4. Audit Log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      actor_role: user.app_metadata?.app_role || 'staff',
      action: 'INVITATION_SENT',
      target_organization_id: organization_id,
      metadata: { email, role }
    });

    return NextResponse.json({ success: true, invitation_id: invitation.id });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
