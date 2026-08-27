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

    const isDeveloper = user.app_metadata?.app_role === 'developer';
    if (!isDeveloper) {
      return NextResponse.json({ error: "Forbidden: Developer access required" }, { status: 403 });
    }

    const body = await request.json();
    const { name, slug, owner_email, owner_name } = body;

    if (!name || !slug || !owner_email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Create Organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name, slug })
      .select('id')
      .single();

    if (orgError) {
      if (orgError.code === '23505') {
        return NextResponse.json({ error: "An organization with this slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
    }

    // 2. Insert Pending Invitation for the Owner
    const { data: invitation, error: inviteInsertError } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: org.id,
        email: owner_email.toLowerCase(),
        role: 'owner',
        name: owner_name,
        invited_by: user.id,
        status: 'pending'
      })
      .select('id')
      .single();

    if (inviteInsertError) {
      return NextResponse.json({ error: "Failed to create owner invitation" }, { status: 500 });
    }

    // 3. Send Supabase Auth Invitation using Admin Client
    const adminSupabase = createAdminClient();
    const { error: sendInviteError } = await adminSupabase.auth.admin.inviteUserByEmail(owner_email, {
      data: {
        organization_id: org.id,
        app_role: 'owner'
      },
      redirectTo: `${new URL(request.url).origin}/auth/callback`
    });

    if (sendInviteError) {
      return NextResponse.json({ error: "Failed to send owner invitation email" }, { status: 500 });
    }

    // 4. Audit Log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      actor_role: 'developer',
      action: 'ORGANIZATION_CREATED',
      target_organization_id: org.id,
      metadata: { name, slug, owner_email }
    });

    return NextResponse.json({ success: true, organization_id: org.id, invitation_id: invitation.id });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isDeveloper = user.app_metadata?.app_role === 'developer';
    if (!isDeveloper) {
      return NextResponse.json({ error: "Forbidden: Developer access required" }, { status: 403 });
    }

    // Get all organizations with owner info
    const { data: organizations, error: orgError } = await supabase
      .from('organizations')
      .select(`
        id, name, slug, created_at,
        memberships!left (
          user_id, role,
          profiles:user_id (full_name)
        )
      `)
      .order('created_at', { ascending: false });

    if (orgError) {
      return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
    }

    return NextResponse.json({ organizations });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
