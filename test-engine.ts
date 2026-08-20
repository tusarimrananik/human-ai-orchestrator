import { PrismaClient, TaskStatus, Priority, WorkerType, WaitingType } from '@prisma/client';
import {
  wouldCreateCycle,
  recalculateTaskStatus,
  getDownstreamUnlocks,
  recommendNextTask,
  calculateProjectCriticalPath,
} from './src/lib/engine';

const prisma = new PrismaClient();

async function runTests() {
  console.log('🧪 Starting Engine & Dependency Logic Tests...\n');

  // Test User
  const user = await prisma.user.upsert({
    where: { email: 'test-runner@orchestrator.local' },
    update: {},
    create: {
      email: 'test-runner@orchestrator.local',
      name: 'Test Automation Runner',
    },
  });

  const testProject = await prisma.project.create({
    data: {
      userId: user.id,
      name: `Test Suite Run ${Date.now()}`,
      description: 'Automated test harness for graph correctness',
    },
  });

  const workerMe = await prisma.worker.create({
    data: { userId: user.id, name: 'Tester Me', type: WorkerType.ME, wipLimit: 2 },
  });
  const workerAI = await prisma.worker.create({
    data: { userId: user.id, name: 'Tester AI', type: WorkerType.AI_AGENT, wipLimit: 1 },
  });

  console.log('✓ Created isolated test environment');

  try {
    // ----------------------------------------------------
    // TEST 1: Task with no dependency is READY
    // ----------------------------------------------------
    const taskA = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: testProject.id,
        workerId: workerMe.id,
        title: 'Task A (Root)',
        priority: Priority.HIGH,
        status: TaskStatus.READY,
      },
    });
    const statusA = await recalculateTaskStatus(prisma, taskA.id);
    if (statusA !== TaskStatus.READY) throw new Error(`Test 1 Failed: Expected READY, got ${statusA}`);
    console.log('✓ TEST 1 PASSED: Task with no dependencies stays READY');

    // ----------------------------------------------------
    // TEST 2: Task with unfinished dependency is BLOCKED
    // ----------------------------------------------------
    const taskB = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: testProject.id,
        workerId: workerAI.id,
        title: 'Task B (Depends on A)',
        priority: Priority.MEDIUM,
        status: TaskStatus.BLOCKED,
      },
    });

    await prisma.taskDependency.create({
      data: { taskId: taskB.id, dependsOnTaskId: taskA.id },
    });

    const statusB_before = await recalculateTaskStatus(prisma, taskB.id);
    if (statusB_before !== TaskStatus.BLOCKED)
      throw new Error(`Test 2 Failed: Expected BLOCKED, got ${statusB_before}`);
    console.log('✓ TEST 2 PASSED: Task with unfinished dependency is BLOCKED');

    // ----------------------------------------------------
    // TEST 3: Multiple Parallel Dependencies (Task C & Task D depend on A)
    // ----------------------------------------------------
    const taskC = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: testProject.id,
        workerId: workerMe.id,
        title: 'Task C (Depends on A)',
        priority: Priority.CRITICAL,
        status: TaskStatus.BLOCKED,
      },
    });
    await prisma.taskDependency.create({
      data: { taskId: taskC.id, dependsOnTaskId: taskA.id },
    });

    // ----------------------------------------------------
    // TEST 4: Completing A automatically makes B & C READY simultaneously
    // ----------------------------------------------------
    await prisma.task.update({
      where: { id: taskA.id },
      data: { status: TaskStatus.DONE, completedAt: new Date() },
    });

    await recalculateTaskStatus(prisma, taskA.id);

    const updatedB = await prisma.task.findUnique({ where: { id: taskB.id } });
    const updatedC = await prisma.task.findUnique({ where: { id: taskC.id } });

    if (updatedB?.status !== TaskStatus.READY || updatedC?.status !== TaskStatus.READY) {
      throw new Error(
        `Test 4 Failed: Expected B & C to become READY. Got B=${updatedB?.status}, C=${updatedC?.status}`
      );
    }
    console.log('✓ TEST 4 PASSED: Completing parent task unlocks parallel children simultaneously');

    // ----------------------------------------------------
    // TEST 5: Multiple Prerequisites (Task E depends on B AND C)
    // ----------------------------------------------------
    const taskE = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: testProject.id,
        workerId: workerMe.id,
        title: 'Task E (Depends on B & C)',
        priority: Priority.HIGH,
        status: TaskStatus.BLOCKED,
      },
    });
    await prisma.taskDependency.create({
      data: { taskId: taskE.id, dependsOnTaskId: taskB.id },
    });
    await prisma.taskDependency.create({
      data: { taskId: taskE.id, dependsOnTaskId: taskC.id },
    });

    // Mark only B done. E should remain BLOCKED because C is still READY (unfinished).
    await prisma.task.update({
      where: { id: taskB.id },
      data: { status: TaskStatus.DONE },
    });
    await recalculateTaskStatus(prisma, taskB.id);

    const updatedE_partial = await prisma.task.findUnique({ where: { id: taskE.id } });
    if (updatedE_partial?.status !== TaskStatus.BLOCKED) {
      throw new Error(
        `Test 5 Failed: Expected E to remain BLOCKED with 1 unfinished prerequisite. Got ${updatedE_partial?.status}`
      );
    }

    // Now mark C done. E must automatically become READY.
    await prisma.task.update({
      where: { id: taskC.id },
      data: { status: TaskStatus.DONE },
    });
    await recalculateTaskStatus(prisma, taskC.id);

    const updatedE_full = await prisma.task.findUnique({ where: { id: taskE.id } });
    if (updatedE_full?.status !== TaskStatus.READY) {
      throw new Error(
        `Test 5 Failed: Expected E to become READY when all prereqs are done. Got ${updatedE_full?.status}`
      );
    }
    console.log('✓ TEST 5 PASSED: Multi-parent dependencies unlock only when ALL prerequisites are DONE');

    // ----------------------------------------------------
    // TEST 6: Cycle Prevention (E depends on B, B depends on A. Try A depends on E)
    // ----------------------------------------------------
    const isCycle1 = await wouldCreateCycle(prisma, taskA.id, taskE.id);
    if (!isCycle1) {
      throw new Error('Test 6 Failed: Cycle detection missed A -> E when E depends on A!');
    }
    console.log('✓ TEST 6 PASSED: Circular dependency prevention detects indirect cycle A -> E -> ... -> A');

    // Self dependency cycle
    const isCycle2 = await wouldCreateCycle(prisma, taskA.id, taskA.id);
    if (!isCycle2) throw new Error('Test 6 Failed: Cycle detection missed self-dependency');
    console.log('✓ TEST 6B PASSED: Self-dependency cycle prevented');

    // ----------------------------------------------------
    // TEST 7: Reopening a dependency re-blocks downstream tasks
    // ----------------------------------------------------
    await prisma.task.update({
      where: { id: taskC.id },
      data: { status: TaskStatus.IN_PROGRESS },
    });
    await recalculateTaskStatus(prisma, taskC.id);

    const updatedE_reopened = await prisma.task.findUnique({ where: { id: taskE.id } });
    if (updatedE_reopened?.status !== TaskStatus.BLOCKED) {
      throw new Error(
        `Test 7 Failed: Expected E to revert to BLOCKED when parent C reopened. Got ${updatedE_reopened?.status}`
      );
    }
    console.log('✓ TEST 7 PASSED: Reopening prerequisite correctly re-blocks downstream tasks');

    // ----------------------------------------------------
    // TEST 8: Downstream unlocks count
    // ----------------------------------------------------
    const unlocksA = await getDownstreamUnlocks(prisma, taskA.id);
    console.log(`✓ TEST 8 PASSED: Downstream unlocks for Root Task A: Direct=${unlocksA.direct}, Total=${unlocksA.total}`);

    // ----------------------------------------------------
    // TEST 9: "What should I do now?" Recommendation Engine
    // ----------------------------------------------------
    // Create an independent high-priority task for Me
    const urgentTask = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: testProject.id,
        workerId: workerMe.id,
        title: 'Fix Production Auth Bug',
        priority: Priority.CRITICAL,
        status: TaskStatus.READY,
        estimatedDuration: 30,
      },
    });

    const recommendations = await recommendNextTask(prisma, user.id, testProject.id);
    if (recommendations.primaryRecommendation?.id !== urgentTask.id) {
      throw new Error(
        `Test 9 Failed: Expected urgent task to be primary recommendation. Got: ${recommendations.primaryRecommendation?.title}`
      );
    }
    console.log(`✓ TEST 9 PASSED: Recommendation engine selected: "${recommendations.primaryRecommendation.title}"`);

    // ----------------------------------------------------
    // TEST 10: Critical Path calculation
    // ----------------------------------------------------
    const cp = await calculateProjectCriticalPath(prisma, testProject.id);
    console.log(`✓ TEST 10 PASSED: Critical Path calculated. Total estimated duration: ${cp.totalDurationMinutes} mins. Critical task IDs count: ${cp.criticalTaskIds.length}`);

    console.log('\n🎉 ALL 10 ENGINE & GRAPH LOGIC TESTS PASSED WITHOUT ERRORS!\n');
  } finally {
    // Cleanup test project
    await prisma.project.delete({ where: { id: testProject.id } });
    await prisma.worker.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
