import agenda from "./AgendaInstance.js";
import { Professional } from "../../models/Professional.model.js";

// Example criteria
const FEATURED_RATING_THRESHOLD = 4.8;
const VERIFIED_MIN_FEEDBACKS = 10;

agenda.define("feature_and_verify_professionals", async (job) => {
  // Feature professionals with high rating
  await Professional.updateMany(
    { rating: { $gte: FEATURED_RATING_THRESHOLD } },
    { $set: { featured: true } }
  );

  // Un-feature those who no longer meet criteria
  await Professional.updateMany(
    { rating: { $lt: FEATURED_RATING_THRESHOLD } },
    { $set: { featured: false } }
  );

  // Verify professionals with enough feedbacks
  await Professional.updateMany(
    { ratingCount: { $gte: VERIFIED_MIN_FEEDBACKS } },
    { $set: { verified: true } }
  );

  // Un-verify those who no longer meet criteria
  await Professional.updateMany(
    { ratingCount: { $lt: VERIFIED_MIN_FEEDBACKS } },
    { $set: { verified: false } }
  );
});