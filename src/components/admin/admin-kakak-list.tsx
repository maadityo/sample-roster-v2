"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { formatShortDate, cn } from "@/lib/utils";
import { UserPlus } from "lucide-react";

interface Kakak {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isActive: boolean;
  monthlyAbsenceCount: number;
  atLimit: boolean;
  approachingLimit: boolean;
  absences: { id: string; status: string; date: string }[];
}

interface AdminKakakListProps {
  kakaks: Kakak[];
  maxPerMonth: number;
}

export function AdminKakakList({ kakaks, maxPerMonth }: AdminKakakListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function handleAddKakak(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: name || undefined, role: "KAKAK" }),
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Kakak added" });
      setShowAddForm(false);
      setEmail("");
      setName("");
      router.refresh();
    } else {
      const d = await res.json();
      toast({ title: d.error ?? "Failed", variant: "destructive" });
    }
  }

  async function handleToggleActive(kakak: Kakak) {
    const res = await fetch(`/api/users/${kakak.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !kakak.isActive }),
    });
    if (res.ok) {
      toast({ title: `Kakak ${kakak.isActive ? "deactivated" : "activated"}` });
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => setShowAddForm((v) => !v)}
          className="gap-1.5"
        >
          <UserPlus className="w-4 h-4" />
          Add Kakak
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-dashed border-blue-300">
          <CardContent className="p-4">
            <form onSubmit={handleAddKakak} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Gmail Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="volunteer@gmail.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Adding..." : "Add Kakak"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {kakaks.map((k) => (
          <Card
            key={k.id}
            className={cn(!k.isActive && "opacity-60")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {k.name ?? k.email}
                    </p>
                    {!k.isActive && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    {k.atLimit && (
                      <Badge variant="destructive">At limit</Badge>
                    )}
                    {k.approachingLimit && !k.atLimit && (
                      <Badge variant="warning">Near limit</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{k.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {k.monthlyAbsenceCount}/{maxPerMonth} absences this month
                  </p>
                  {/* Show this month's absences */}
                  {k.absences.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {k.absences.map((a) => (
                        <span
                          key={a.id}
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            a.status === "APPROVED"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          )}
                        >
                          {formatShortDate(new Date(a.date))}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleToggleActive(k)}
                  className={cn(
                    "text-xs rounded-lg px-2.5 py-1.5 font-medium transition-colors",
                    k.isActive
                      ? "text-gray-600 bg-gray-100 hover:bg-gray-200"
                      : "text-green-700 bg-green-100 hover:bg-green-200"
                  )}
                >
                  {k.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {kakaks.length === 0 && (
        <div className="text-center text-gray-400 py-12">
          <p className="text-4xl mb-2">👥</p>
          <p>No kakaks yet. Add one above.</p>
        </div>
      )}
    </div>
  );
}
