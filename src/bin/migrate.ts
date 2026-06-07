#!/usr/bin/env node
import { migrateProject } from "@zenarc/core";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: zenarc-migrate <project-name> <project-path> [todo-filename]");
    process.exit(1);
  }

  const [projectName, projectPath, todoFilename] = args;

  console.log(`Migrating ${projectName} at ${projectPath}...`);
  const result = await migrateProject(projectName, projectPath, todoFilename || "TODO.md");

  if (result.tasks > 0) {
    console.log(`✅ Migrated ${result.tasks} tasks`);
    console.log(`📦 Archived original to TODO.md.archive`);
  } else {
    console.log("⚠️ No TODO.md found or no tasks extracted");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
