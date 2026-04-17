"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { AnalyticsData } from "@/types";

interface ChartsProps {
  data: AnalyticsData;
}

export function Charts({ data }: ChartsProps) {
  const lineData = data.messagesPerDay.map((d) => ({
    date: format(parseISO(d.date), "MMM d"),
    Messages: d.count,
  }));

  const barData = data.conversationsByStatus.map((d) => ({
    status: d.status,
    Count: d.count,
  }));

  const statusColors: Record<string, string> = {
    OPEN: "#22c55e",
    PENDING: "#eab308",
    RESOLVED: "#6b7280",
  };

  return (
    <div className="space-y-6">
      {/* Line chart - messages per day */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-4">
          Messages Sent — Last 30 Days
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#f9fafb",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="Messages"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#22c55e" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bar chart - conversations by status */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-4">
          Conversations by Status
        </h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={barData} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="status"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#f9fafb",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="Count" radius={[4, 4, 0, 0]}>
              {barData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={statusColors[entry.status] ?? "#22c55e"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Agent performance table */}
      {data.agentPerformance.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">
            Agent Performance
          </h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-xs text-gray-500 font-medium pb-2">
                  Agent
                </th>
                <th className="text-right text-xs text-gray-500 font-medium pb-2">
                  Conversations
                </th>
                <th className="text-right text-xs text-gray-500 font-medium pb-2">
                  Avg Response
                </th>
              </tr>
            </thead>
            <tbody>
              {data.agentPerformance.map((a) => (
                <tr
                  key={a.agentId}
                  className="border-b border-gray-700/50 last:border-0"
                >
                  <td className="py-2 text-sm text-white">{a.agentName}</td>
                  <td className="py-2 text-right text-sm text-gray-300">
                    {a.handled}
                  </td>
                  <td className="py-2 text-right text-sm text-gray-300">
                    {a.avgResponseTime > 0
                      ? `${a.avgResponseTime}m`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
