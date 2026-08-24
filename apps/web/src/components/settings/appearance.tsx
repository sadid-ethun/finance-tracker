"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { Card } from "@/components/shared/card";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function Appearance() {
  const { theme, setTheme } = useTheme();

  return (
    <Card as="section" className="p-5">
      <h2 className="text-[16px] font-semibold">Appearance</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        System follows your device setting.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-[14px] bg-secondary p-1">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={theme === option.value}
            className={cn(
              "flex h-10 items-center justify-center gap-1.5 rounded-[11px] text-[13px] font-medium",
              theme === option.value ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            <option.icon className="size-4" />
            {option.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
