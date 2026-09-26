type Job = {
  id: string;
  key: string;
  task: () => Promise<void>;
};

class JobQueue {
  private queue: Job[] = [];

  private running = false;

  private activeKeys = new Set<string>();

  enqueue(
    key: string,
    task: () => Promise<void>
  ): string {
    if (this.activeKeys.has(key)) {
      return "";
    }

    const id = `${key}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    this.activeKeys.add(key);

    this.queue.push({
      id,
      key,
      task,
    });

    void this.process();

    return id;
  }

  private async process(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();

        if (!job) {
          continue;
        }

        try {
          console.log(
            `[Job Queue] Starting job: ${job.id}`
          );

          await job.task();

          console.log(
            `[Job Queue] Completed job: ${job.id}`
          );
        } catch (error) {
          console.error(
            `[Job Queue] Job failed: ${job.id}`,
            error
          );
        } finally {
          this.activeKeys.delete(job.key);
        }
      }
    } finally {
      this.running = false;

      if (this.queue.length > 0) {
        void this.process();
      }
    }
  }

  get pendingJobs(): number {
    return this.queue.length;
  }

  get isRunning(): boolean {
    return this.running;
  }
}

export const jobQueue = new JobQueue();