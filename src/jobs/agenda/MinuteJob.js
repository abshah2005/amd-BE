import { autoCloseExpiredQuestions, autoCloseExpiredThreads } from "../../crons/Threads.job.js";
import agenda from "./AgendaInstance.js";

agenda.define("minute check", async (job) => {
  console.log("Running minute check job...");
  autoCloseExpiredQuestions();
  autoCloseExpiredThreads();
});