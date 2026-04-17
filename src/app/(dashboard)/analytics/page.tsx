"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import {
  MessageSquare,
  Users,
  Clock,
  Send,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { AnalyticsData } from "@/types";
import { Charts } from "@/components/analytics/Charts";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchData() {
    try {
      const res = await axios.get("/api/analytics");
      setData(res.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Analytics</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Overview of your support performance
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-green-500" />
          </div>
        ) : data ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Conversations Today"
                value={data.totalToday}
                icon={MessageSquare}
                color="bg-blue-500"
              />
              <StatCard
                label="Open Conversations"
                value={data.openConversations}
                icon={Users}
                color="bg-green-500"
              />
              <StatCard
                label="Avg Response Time"
                value={data.avgResponseTime > 0 ? `${data.avgResponseTime}m` : "—"}
                icon={Clock}
                color="bg-yellow-500"
              />
              <StatCard
                label="Messages Sent Today"
                value={data.messagesToday}
                icon={Send}
                color="bg-purple-500"
              />
            </div>

            {/* Charts */}
            <Charts data={data} />
          </>
        ) : (
          <div className="text-center py-20 text-gray-600">
            <p>Failed to load analytics data</p>
          </div>
        )}
      </div>
    </div>
  );
}
