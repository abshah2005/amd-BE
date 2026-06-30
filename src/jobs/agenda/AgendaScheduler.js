import cron from "node-cron";
import {
  autoCloseExpiredQuestions,
  autoCloseExpiredThreads,
} from "../../crons/Threads.job.js";
import { processAccountDeletions } from "../../crons/AccountDeletionJob.js";
import { processPendingPayouts } from "./ProcessingPayout.js";

export const startAgenda = () => {
  cron.schedule("*/5 * * * *", async () => {
    await autoCloseExpiredQuestions();
    await autoCloseExpiredThreads();
  });

  cron.schedule("*/15 * * * *", async () => {
    await processAccountDeletions();
  });

  cron.schedule("0 */2 * * *", async () => {
    await processPendingPayouts();
  });

  // cron.schedule("* * * * *", async () => {
  //   await processPendingPayouts();
  // });

  console.log("Cron jobs started.");
};
