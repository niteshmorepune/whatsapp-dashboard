"use client";

import { Template } from "@/types";
import { CheckCircle, Clock, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface TemplateListProps {
  templates: Template[];
  isAdmin: boolean;
  onEdit: (template: Template) => void;
  onDelete: (id: string) => void;
  onToggleApprove: (template: Template) => void;
}

const categoryColors: Record<string, "green" | "blue" | "purple" | "yellow" | "gray"> = {
  MARKETING: "purple",
  UTILITY: "blue",
  AUTHENTICATION: "yellow",
  SERVICE: "green",
};

export function TemplateList({
  templates,
  isAdmin,
  onEdit,
  onDelete,
  onToggleApprove,
}: TemplateListProps) {
  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-600">
        <p className="text-sm">No templates yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
      {templates.map((template) => (
        <div
          key={template.id}
          className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-3 hover:border-gray-600 transition"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-sm font-semibold text-white truncate">
                {template.name}
              </span>
              <Badge variant={categoryColors[template.category] ?? "gray"}>
                {template.category}
              </Badge>
              <Badge variant="gray">{template.language}</Badge>
            </div>
            {template.isApproved ? (
              <div className="flex items-center gap-1 text-green-400 flex-shrink-0">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="text-xs">Approved</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-yellow-400 flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs">Pending</span>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 flex-1 leading-relaxed line-clamp-4">
            {template.content}
          </p>

          <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
            <button
              onClick={() => onEdit(template)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition"
            >
              <Edit className="w-3.5 h-3.5" />
              Edit
            </button>

            {isAdmin && (
              <button
                onClick={() => onToggleApprove(template)}
                className={cn(
                  "flex items-center gap-1 text-xs transition",
                  template.isApproved
                    ? "text-yellow-400 hover:text-yellow-300"
                    : "text-green-400 hover:text-green-300"
                )}
              >
                {template.isApproved ? (
                  <>
                    <Clock className="w-3.5 h-3.5" /> Revoke
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => onDelete(template.id)}
              className="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
