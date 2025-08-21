import Agenda from "agenda";

const agenda = new Agenda({
  db: { address: process.env.MONGODB_URI, collection: "agendaJobs" },
  processEvery: "30 seconds", 
});

export default agenda;