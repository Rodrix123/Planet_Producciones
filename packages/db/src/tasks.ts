import { desc, eq } from "drizzle-orm";

import { db } from "./index";
import { task } from "./schema/task";

export type Task = typeof task.$inferSelect;

export function listTasks() {
  return db.select().from(task).orderBy(desc(task.createdAt));
}

export async function createTask(title: string): Promise<Task> {
  const [created] = await db.insert(task).values({ title }).returning();
  if (!created) throw new Error("Could not create the task");
  return created;
}

export async function setTaskCompleted(id: number, completed: boolean) {
  await db.update(task).set({ completed }).where(eq(task.id, id));
}

export async function deleteTask(id: number) {
  await db.delete(task).where(eq(task.id, id));
}
