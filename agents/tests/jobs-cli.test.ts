import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { cleanupFixture, makeFixture, readJson, runBunScript, type TestFixture } from "./helpers.js";

type ScheduledJob = {
  id: string;
  agentId: string;
  status: string;
  prompt: string;
  timestamp: string;
  runCount?: number;
};

type JobsDocument = {
  version: 1;
  framework: "pi.dev";
  jobs: ScheduledJob[];
};

let fixture: TestFixture;

function extractJobId(stdout: string): string {
  const match = stdout.match(/Created job (job_[a-z0-9]+)/i);
  if (!match) {
    throw new Error(`could not parse job id from output: ${stdout}`);
  }
  return match[1];
}

beforeEach(async () => {
  fixture = await makeFixture("jobs-cli");
});

afterEach(async () => {
  await cleanupFixture(fixture);
});

describe("jobs-cli", () => {
  test("create/list/show/edit/remove flow", async () => {
    const create = await runBunScript(
      "skills/scheduled-jobs/cli.ts",
      [
        "create",
        "--agent",
        "scout",
        "--at",
        "2026-02-08T15:00:00Z",
        "--prompt",
        "Review overnight earnings"
      ],
      fixture.env
    );
    expect(create.code).toBe(0);
    const jobId = extractJobId(create.stdout);

    const list = await runBunScript("skills/scheduled-jobs/cli.ts", ["list", "--json"], fixture.env);
    expect(list.code).toBe(0);
    const jobs = JSON.parse(list.stdout) as ScheduledJob[];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe(jobId);
    expect(jobs[0]?.agentId).toBe("scout");

    const show = await runBunScript("skills/scheduled-jobs/cli.ts", ["show", jobId], fixture.env);
    expect(show.code).toBe(0);
    const shown = JSON.parse(show.stdout) as ScheduledJob;
    expect(shown.id).toBe(jobId);
    expect(shown.status).toBe("scheduled");
    expect(shown.prompt).toBe("Review overnight earnings");

    const edit = await runBunScript(
      "skills/scheduled-jobs/cli.ts",
      ["edit", jobId, "--prompt", "Updated prompt", "--in", "10m"],
      fixture.env
    );
    expect(edit.code).toBe(0);
    expect(edit.stdout).toContain(`Updated job ${jobId}`);

    const showAfter = await runBunScript("skills/scheduled-jobs/cli.ts", ["show", jobId], fixture.env);
    const edited = JSON.parse(showAfter.stdout) as ScheduledJob;
    expect(edited.prompt).toBe("Updated prompt");
    expect(edited.status).toBe("scheduled");

    const remove = await runBunScript("skills/scheduled-jobs/cli.ts", ["remove", jobId], fixture.env);
    expect(remove.code).toBe(0);

    const listAfter = await runBunScript("skills/scheduled-jobs/cli.ts", ["list", "--json"], fixture.env);
    expect(JSON.parse(listAfter.stdout)).toEqual([]);
  });

  test("list table includes runs column", async () => {
    const jobsFile = path.join(fixture.workspaceDir, "scheduled-jobs.json");
    const payload: JobsDocument = {
      version: 1,
      framework: "pi.dev",
      jobs: [
        {
          id: "job_table1",
          agentId: "scout",
          status: "completed",
          prompt: "done",
          timestamp: "2026-02-08T15:00:00Z",
          runCount: 3
        }
      ]
    };
    await Bun.write(jobsFile, `${JSON.stringify(payload, null, 2)}\n`);

    const list = await runBunScript("skills/scheduled-jobs/cli.ts", ["list"], fixture.env);
    expect(list.code).toBe(0);
    expect(list.stdout).toContain("runs");
    expect(list.stdout).toContain("job_table1");
    expect(list.stdout).toContain("3");
  });

  test("returns errors on invalid usage", async () => {
    const missingPrompt = await runBunScript(
      "skills/scheduled-jobs/cli.ts",
      ["create", "--agent", "scout", "--in", "5m"],
      fixture.env
    );
    expect(missingPrompt.code).toBe(1);
    expect(missingPrompt.stderr).toContain("missing --prompt");

    const unknown = await runBunScript("skills/scheduled-jobs/cli.ts", ["wat"], fixture.env);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("unknown command");
  });

  test("persists jobs in workspace scheduled-jobs file", async () => {
    const create = await runBunScript(
      "skills/scheduled-jobs/cli.ts",
      ["create", "--agent", "planner", "--in", "1m", "--prompt", "test"],
      fixture.env
    );
    expect(create.code).toBe(0);

    const jobsFile = path.join(fixture.workspaceDir, "scheduled-jobs.json");
    const doc = await readJson<JobsDocument>(jobsFile);
    expect(doc.framework).toBe("pi.dev");
    expect(doc.jobs).toHaveLength(1);
    expect(doc.jobs[0]?.status).toBe("scheduled");
  });
});
