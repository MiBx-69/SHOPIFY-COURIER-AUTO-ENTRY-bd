import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, supabase } = await currentUser();
    const { id } = await params;

    const { error } = await supabase
      .from("saved_filters")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
