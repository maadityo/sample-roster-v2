import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/ui/nav-bar";

export default async function KakakLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "ADMIN") redirect("/admin/dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar user={session.user} />
      <main className="max-w-md mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
