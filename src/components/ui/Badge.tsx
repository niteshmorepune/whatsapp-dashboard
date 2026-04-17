import { cn } from "@/lib/utils";

type BadgeVariant = "green" | "yellow" | "red" | "blue" | "gray" | "purple";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  green: "bg-green-900/50 text-green-400 border-green-800",
  yellow: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  red: "bg-red-900/50 text-red-400 border-red-800",
  blue: "bg-blue-900/50 text-blue-400 border-blue-800",
  gray: "bg-gray-800 text-gray-400 border-gray-700",
  purple: "bg-purple-900/50 text-purple-400 border-purple-800",
};

export function Badge({ children, variant = "gray", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
