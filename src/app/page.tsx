import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getAuthenticatedUser();
  redirect(user ? "/orders" : "/login");
}
