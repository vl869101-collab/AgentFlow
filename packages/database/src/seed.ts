import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Find existing user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No user found. Register via API first.");
    return;
  }

  // Find or create organization
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "Default Organization", slug: "default" },
    });
    console.log(`Created organization: ${org.name}`);
  }

  // Create sample workflows
  const workflows = [
    { name: "GitHub Issue to Slack", description: "Notify Slack when a GitHub issue is created" },
    { name: "Daily Report Generator", description: "Generate and send daily reports via email" },
    { name: "Customer Onboarding", description: "Automated onboarding flow for new customers" },
    { name: "Invoice Processing", description: "Process and categorize incoming invoices" },
    { name: "Social Media Monitor", description: "Monitor mentions and respond automatically" },
  ];

  for (const wf of workflows) {
    const workflow = await prisma.workflow.create({
      data: {
        ...wf,
        ownerId: user.id,
        orgId: org.id,
      },
    });
    console.log(`Created workflow: ${workflow.name}`);

    // Create nodes for each workflow
    const nodes = await Promise.all([
      prisma.workflowNode.create({
        data: {
          workflowId: workflow.id,
          type: "trigger",
          label: "Trigger",
          config: JSON.stringify({ event: "webhook" }),
          position: JSON.stringify({ x: 100, y: 100 }),
        },
      }),
      prisma.workflowNode.create({
        data: {
          workflowId: workflow.id,
          type: "ai",
          label: "Process with AI",
          config: JSON.stringify({
            model: "meta/llama-3.1-8b-instruct",
            prompt: "Process the input",
          }),
          position: JSON.stringify({ x: 350, y: 100 }),
        },
      }),
      prisma.workflowNode.create({
        data: {
          workflowId: workflow.id,
          type: "output",
          label: "Output",
          config: JSON.stringify({ format: "json" }),
          position: JSON.stringify({ x: 600, y: 100 }),
        },
      }),
    ]);

    // Create edges
    await prisma.workflowEdge.create({
      data: {
        workflowId: workflow.id,
        sourceNodeId: nodes[0].id,
        targetNodeId: nodes[1].id,
      },
    });
    await prisma.workflowEdge.create({
      data: {
        workflowId: workflow.id,
        sourceNodeId: nodes[1].id,
        targetNodeId: nodes[2].id,
      },
    });
  }

  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
