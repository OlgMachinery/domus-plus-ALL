import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UserProfile = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  family_id: string | null;
  role: "admin" | "member";
  is_active: boolean;
};

export async function requireFamily(): Promise<UserProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("domus_users")
    .select("id,email,phone,name,family_id,role,is_active")
    .eq("id", user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("User profile not found");
  }

  if (!data.family_id) {
    redirect("/setup");
  }

  return data as UserProfile;
}
