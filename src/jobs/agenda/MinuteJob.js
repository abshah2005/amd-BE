import agenda from "./AgendaInstance.js";

agenda.define("minute check", async (job) => {
  console.log("minute check running");
});