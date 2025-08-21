import agenda from "./AgendaInstance.js";

agenda.define("monthly midnight task", async (job) => {
  console.log("Monthly midnight task running");
});