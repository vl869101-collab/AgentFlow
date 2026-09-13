import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://agentflow:agentflow_dev@localhost:5433/agentflow?schema=public",
    },
  },
});

async function main() {
  const users = await prisma.user.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      memberships: {
        include: { org: true }
      }
    }
  });
  console.log("Recent users in DB:");
  for (const u of users) {
    console.log(`- ID: ${u.id}, Email: ${u.email}, Name: ${u.name}, Orgs: ${u.memberships.map(m => `${m.org.slug} (${m.role})`).join(", ")}`);
  }
  await prisma.$disconnect();
}

main().catch(console.error);
