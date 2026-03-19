"use client";

import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { CalendarDays, ClipboardList, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavBarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function NavBar({ user }: NavBarProps) {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Schedule", icon: CalendarDays },
    { href: "/absence", label: "My Absences", icon: ClipboardList },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-blue-600 text-lg">
          Kakak
        </Link>

        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="ml-2 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </nav>
      </div>
    </header>
  );
}
