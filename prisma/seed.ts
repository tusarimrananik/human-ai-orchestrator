import { PrismaClient, WorkerType, Priority, TaskStatus, WaitingType } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedDatabase() {
  console.log('🌱 Seeding database...');

  // 1. Ensure Default User
  const user = await prisma.user.upsert({
    where: { email: 'anik@orchestrator.local' },
    update: { name: 'Tusar Imran Anik' },
    create: {
      email: 'anik@orchestrator.local',
      name: 'Tusar Imran Anik',
    },
  });

  console.log(`👤 User: ${user.name} (${user.id})`);

  // 2. Default Workers with WIP limits
  const workersData = [
    { name: 'Me', type: WorkerType.ME, wipLimit: 2, description: 'Direct human execution' },
    { name: 'Hermes', type: WorkerType.AI_AGENT, wipLimit: 2, description: 'Autonomous agent specializing in backend and tools' },
    { name: 'Claude', type: WorkerType.AI_AGENT, wipLimit: 2, description: 'Anthropic Claude reasoning and frontend architecture' },
    { name: 'Gemini', type: WorkerType.AI_AGENT, wipLimit: 3, description: 'Google Gemini research & synthesis specialist' },
    { name: 'Developer', type: WorkerType.TEAM_MEMBER, wipLimit: 2, description: 'Senior fullstack engineer' },
    { name: 'Designer', type: WorkerType.TEAM_MEMBER, wipLimit: 1, description: 'Product and UI/UX designer' },
  ];

  const workers: Record<string, any> = {};
  for (const w of workersData) {
    const existing = await prisma.worker.findFirst({
      where: { userId: user.id, name: w.name },
    });
    if (existing) {
      workers[w.name] = await prisma.worker.update({
        where: { id: existing.id },
        data: { type: w.type, wipLimit: w.wipLimit, description: w.description },
      });
    } else {
      workers[w.name] = await prisma.worker.create({
        data: {
          userId: user.id,
          name: w.name,
          type: w.type,
          wipLimit: w.wipLimit,
          description: w.description,
        },
      });
    }
  }

  // 3. Demo Project 1: "Launch SaaS MVP"
  let project1 = await prisma.project.findFirst({
    where: { userId: user.id, name: 'Launch SaaS MVP' },
  });

  if (!project1) {
    project1 = await prisma.project.create({
      data: {
        userId: user.id,
        name: 'Launch SaaS MVP',
        description: 'Complete Human + AI parallel workflow to launch an AI SaaS product in record time.',
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days out
      },
    });
  }

  // Demo Project 2: "Routine & Attendance System"
  let project2 = await prisma.project.findFirst({
    where: { userId: user.id, name: 'Routine & Attendance System' },
  });
  if (!project2) {
    project2 = await prisma.project.create({
      data: {
        userId: user.id,
        name: 'Routine & Attendance System',
        description: 'Automated student class routine, exam schedule, and CT attendance management.',
        deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Check if project 1 already has tasks
  const existingTasksCount = await prisma.task.count({
    where: { projectId: project1.id },
  });

  if (existingTasksCount === 0) {
    console.log('Creating demo tasks for Launch SaaS MVP...');
    
    // Milestones
    const mPlanning = await prisma.milestone.create({
      data: { projectId: project1.id, name: 'Planning & Strategy', orderIndex: 1 },
    });
    const mMvp = await prisma.milestone.create({
      data: { projectId: project1.id, name: 'MVP Core Implementation', orderIndex: 2 },
    });
    const mLaunch = await prisma.milestone.create({
      data: { projectId: project1.id, name: 'Integration & Testing', orderIndex: 3 },
    });

    // Task 1: Decide product idea (Me) - DONE
    const tDecideIdea = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        milestoneId: mPlanning.id,
        workerId: workers['Me'].id,
        title: 'Decide product idea',
        description: 'Finalize value proposition, target customer profile, and core problem to solve.',
        completionCriteria: 'Clear 1-page spec with target persona and core value proposition written.',
        priority: Priority.CRITICAL,
        status: TaskStatus.DONE,
        estimatedDuration: 60,
        completedAt: new Date(Date.now() - 3600000 * 4),
      },
    });

    // Task 2: Research competitors (AI - Gemini) - IN_PROGRESS
    const tResearchCompetitors = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        milestoneId: mPlanning.id,
        workerId: workers['Gemini'].id,
        title: 'Research competitors',
        description: 'Analyze top 10 competitors, matrix of pricing, key features, and user complaints.',
        completionCriteria: 'Comprehensive markdown report comparing pricing, features, and target niche.',
        aiInstructions: 'Analyze top competitors in the AI task orchestration space. Output a table with feature tiers and pricing.',
        aiExpectedOutput: 'Detailed competitor breakdown table and SWOT analysis.',
        priority: Priority.HIGH,
        status: TaskStatus.IN_PROGRESS,
        actualStartedAt: new Date(Date.now() - 1000 * 60 * 25), // started 25 min ago
        estimatedDuration: 45,
      },
    });

    // Task 3: Create UI design (AI - Claude) - READY
    const tCreateUiDesign = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        milestoneId: mPlanning.id,
        workerId: workers['Claude'].id,
        title: 'Create UI design',
        description: 'Generate high-fidelity layout concepts and component hierarchy for modern desktop dashboard.',
        completionCriteria: 'Design specs, color tokens, and navigation hierarchy documented.',
        priority: Priority.HIGH,
        status: TaskStatus.READY,
        estimatedDuration: 90,
      },
    });

    // Task 4: Design database schema (Me) - READY (Independent branch, ready for user right now!)
    const tDesignDbSchema = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        milestoneId: mMvp.id,
        workerId: workers['Me'].id,
        title: 'Design database schema',
        description: 'Create PostgreSQL relational schema covering users, projects, tasks, workers, and dependencies.',
        completionCriteria: 'Prisma schema file written and migrations applied with zero cycle errors.',
        priority: Priority.CRITICAL,
        status: TaskStatus.READY,
        estimatedDuration: 45,
      },
    });

    // Task 5: Build frontend (Me) - BLOCKED (Depends on Create UI design)
    const tBuildFrontend = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        milestoneId: mMvp.id,
        workerId: workers['Me'].id,
        title: 'Build frontend',
        description: 'Implement Next.js App Router UI, interactive dependency graph, and Kanban board.',
        completionCriteria: 'Interactive dashboard with smooth animations and responsive mobile views.',
        priority: Priority.HIGH,
        status: TaskStatus.BLOCKED,
        estimatedDuration: 180,
      },
    });

    // Task 6: Build backend (AI - Hermes) - BLOCKED (Depends on Design database schema)
    const tBuildBackend = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        milestoneId: mMvp.id,
        workerId: workers['Hermes'].id,
        title: 'Build backend',
        description: 'Implement REST API endpoints, cycle detection, automatic status engine, and ranking algorithm.',
        completionCriteria: 'Fully tested server endpoints passing status recalculation and cycle validation tests.',
        aiInstructions: 'Create complete Next.js route handlers for task CRUD, status recalculation, and graph queries.',
        aiExpectedOutput: 'Clean TypeScript API routes with error handling and transaction safety.',
        priority: Priority.CRITICAL,
        status: TaskStatus.BLOCKED,
        estimatedDuration: 120,
      },
    });

    // Task 7: Integrate frontend + backend (Me) - BLOCKED (Depends on Build frontend AND Build backend)
    const tIntegrate = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        milestoneId: mLaunch.id,
        workerId: workers['Me'].id,
        title: 'Integrate frontend + backend',
        description: 'Connect UI components to live API endpoints, verify real-time status updates and optimistic UI.',
        completionCriteria: 'End-to-end task lifecycle tested from creation to completion without bugs.',
        priority: Priority.CRITICAL,
        status: TaskStatus.BLOCKED,
        estimatedDuration: 90,
      },
    });

    // Task 8: Test MVP (Me) - BLOCKED (Depends on Integrate frontend + backend)
    const tTestMvp = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        milestoneId: mLaunch.id,
        workerId: workers['Me'].id,
        title: 'Test MVP',
        description: 'Comprehensive QA across cycle prevention, WIP limits, parallel execution, and responsive views.',
        completionCriteria: 'All test scenarios pass and production build deployed successfully.',
        priority: Priority.HIGH,
        status: TaskStatus.BLOCKED,
        estimatedDuration: 60,
      },
    });

    // Insert Dependencies (Finish-to-Start)
    const dependencies = [
      // Research competitors depends on Decide product idea
      { taskId: tResearchCompetitors.id, dependsOnTaskId: tDecideIdea.id },
      // Create UI design depends on Decide product idea
      { taskId: tCreateUiDesign.id, dependsOnTaskId: tDecideIdea.id },
      // Design database schema depends on Decide product idea
      { taskId: tDesignDbSchema.id, dependsOnTaskId: tDecideIdea.id },
      // Build frontend depends on Create UI design
      { taskId: tBuildFrontend.id, dependsOnTaskId: tCreateUiDesign.id },
      // Build backend depends on Design database schema
      { taskId: tBuildBackend.id, dependsOnTaskId: tDesignDbSchema.id },
      // Integrate frontend + backend depends on Build frontend AND Build backend (Multi-parent!)
      { taskId: tIntegrate.id, dependsOnTaskId: tBuildFrontend.id },
      { taskId: tIntegrate.id, dependsOnTaskId: tBuildBackend.id },
      // Test MVP depends on Integrate frontend + backend
      { taskId: tTestMvp.id, dependsOnTaskId: tIntegrate.id },
    ];

    for (const dep of dependencies) {
      await prisma.taskDependency.create({
        data: dep,
      });
    }

    // Add some subtasks for Design database schema
    await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        parentId: tDesignDbSchema.id,
        title: 'Define Postgres models for Users, Projects & Workers',
        status: TaskStatus.DONE,
        priority: Priority.HIGH,
        workerId: workers['Me'].id,
      }
    });
    await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        parentId: tDesignDbSchema.id,
        title: 'Define TaskDependency with unique composite indexes',
        status: TaskStatus.DONE,
        priority: Priority.HIGH,
        workerId: workers['Me'].id,
      }
    });

    // Create a task waiting on external approval
    await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project1.id,
        workerId: workers['Me'].id,
        title: 'Configure Stripe payment gateway',
        description: 'Submit business verification and merchant docs to Stripe for live API keys.',
        completionCriteria: 'Stripe webhook secrets and live keys received.',
        priority: Priority.MEDIUM,
        status: TaskStatus.WAITING,
        waitingType: WaitingType.EXTERNAL_SERVICE,
        waitingReason: 'Stripe merchant verification & compliance review',
        waitingSince: new Date(Date.now() - 1000 * 60 * 180), // 3 hours ago
        estimatedDuration: 30,
      }
    });
  }

  console.log('✅ Seeding completed successfully.');
}

if (require.main === module) {
  seedDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
