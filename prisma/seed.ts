import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin@1234", 12);

  const admin = await prisma.agent.upsert({
    where: { email: "admin@youragency.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@youragency.com",
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log("✅ Admin agent created:", admin.email);

  // Seed sample templates
  const templates = [
    {
      name: "hello_world",
      content:
        "Hello! Thanks for reaching out to our support team. How can we help you today?",
      category: "UTILITY",
      isApproved: true,
    },
    {
      name: "order_shipped",
      content:
        "Hi {{1}}, your order #{{2}} has been shipped! You can track it at: {{3}}",
      category: "UTILITY",
      isApproved: true,
    },
    {
      name: "appointment_reminder",
      content:
        "Reminder: You have an appointment scheduled for {{1}} at {{2}}. Reply YES to confirm or NO to cancel.",
      category: "UTILITY",
      isApproved: true,
    },
    {
      name: "welcome_back",
      content:
        "Welcome back! We noticed you haven't visited us in a while. We have some exciting new offers for you. Reply OFFERS to learn more.",
      category: "MARKETING",
      isApproved: false,
    },
  ];

  for (const template of templates) {
    await prisma.template.upsert({
      where: { name: template.name },
      update: {},
      create: template,
    });
  }

  console.log("✅ Sample templates created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
