import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Parallel queries
    const [
      totalToday,
      openConversations,
      messagesToday,
      messagesByDay,
      convByStatus,
      agents,
    ] = await Promise.all([
      prisma.conversation.count({
        where: { createdAt: { gte: today, lt: tomorrow } },
      }),
      prisma.conversation.count({ where: { status: "OPEN" } }),
      prisma.message.count({
        where: {
          createdAt: { gte: today, lt: tomorrow },
          direction: "OUTBOUND",
        },
      }),
      prisma.message.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, direction: true },
      }),
      prisma.conversation.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.agent.findMany({
        where: { isActive: true },
        include: {
          conversations: {
            include: {
              messages: {
                where: { direction: "OUTBOUND" },
                orderBy: { createdAt: "asc" },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    // Build messages per day
    const dayMap: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      dayMap[key] = 0;
    }
    for (const msg of messagesByDay) {
      const key = msg.createdAt.toISOString().split("T")[0];
      if (key in dayMap) dayMap[key]++;
    }
    const messagesPerDay = Object.entries(dayMap).map(([date, count]) => ({
      date,
      count,
    }));

    // Conversations by status
    const conversationsByStatus = convByStatus.map((g) => ({
      status: g.status,
      count: g._count.id,
    }));

    // Agent performance
    const agentPerformance = agents.map((agent) => {
      const handled = agent.conversations.length;
      const responseTimes: number[] = [];

      for (const conv of agent.conversations) {
        const firstReply = conv.messages[0];
        if (firstReply) {
          const diff =
            firstReply.createdAt.getTime() - conv.createdAt.getTime();
          responseTimes.push(diff / 1000 / 60); // minutes
        }
      }

      const avgResponseTime =
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            )
          : 0;

      return {
        agentId: agent.id,
        agentName: agent.name,
        handled,
        avgResponseTime,
      };
    });

    // Overall avg response time
    const allTimes = agentPerformance.map((a) => a.avgResponseTime).filter(Boolean);
    const avgResponseTime =
      allTimes.length > 0
        ? Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length)
        : 0;

    return NextResponse.json({
      totalToday,
      openConversations,
      avgResponseTime,
      messagesToday,
      messagesPerDay,
      conversationsByStatus,
      agentPerformance,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
