import mongoose from "mongoose";
import { Users } from "../models/Users.model.js";
import { Question } from "../models/Question.model.js";
import { Professional } from "../models/Professional.model.js";

export const accountDeletionService = {
  /**
   * Schedule profile deletion.
   * options: { adminInitiated: boolean, adminId: ObjectId|null }
   */
  scheduleProfileDeletion: async (userId, profileType, options = {}) => {
    const { adminInitiated = false, adminId = null } = options;
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 3);

    if (profileType === "asker") {
      await Users.findByIdAndUpdate(userId, {
        isAskerDeleted: true,
        deletionScheduledAt: deletionDate,
        isAskerDeletedByAdmin: !!adminInitiated,
        adminRequestedDeletionBy: adminInitiated ? adminId : null,
      });
    } else if (profileType === "professional") {
      console.log("inside prof deletion by admin ",userId);
      await Users.findByIdAndUpdate(userId, {
        isProDeleted: true,
        deletionScheduledAt: deletionDate,
        isProDeletedByAdmin: !!adminInitiated,
        adminRequestedDeletionBy: adminInitiated ? adminId : null,
      });

      // Update professional status if exists (notes: admin may want to review)
      await Professional.findOneAndUpdate(
        { user: userId },
        { status: "deleted" }
      );
    }

    return { success: true, scheduledDeletionDate: deletionDate };
  },

  processScheduledDeletions: async () => {
    const now = new Date();
    const usersToProcess = await Users.find({
      $or: [{ isAskerDeleted: true }, { isProDeleted: true }],
      deletionScheduledAt: { $lte: now },
      anonymizedAt: { $exists: false },
    });

    for (const user of usersToProcess) {
      await anonymizeUserData(user);
    }

    return { processed: usersToProcess.length };
  },
};

async function anonymizeUserData(user) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    if (user.isAskerDeleted) {
      // Handle asker questions
      await Question.updateMany(
        { asker: user._id },
        {
          $set: {
            body: "This content has been removed.",
            title: "Anonymized Question",
            attachments: [],
          },
        },
        { session }
      );
    }

    if (user.isProDeleted) {
      // For professional profile, anonymize their professional info
      const professionalId = user.professional;

      if (professionalId) {
        // Anonymize professional data first
        await Professional.findByIdAndUpdate(
          professionalId,
          {
            user: null,
            title: "Former Professional",
            about: ["This professional has removed their account."],
            professionalExperiences: [],
            exampleQuestions: [],
            tags: [],
            socialLinks: [],
            verified: false,
            featured: false,
            isDeleted: true,
          },
          { session }
        );

        // Then remove the professional reference from the user
        await Users.findByIdAndUpdate(
          user._id,
          {
            $set: {
              roles: user.roles.filter((r) => r !== "professional"),
              activeRole: user.activeRole === "professional" ? null : "asker",
              deletionScheduledAt: null,
              isProDeleted: false,
              anonymizedAt: new Date(),
            },
            $unset: { professional: "" },
          },
          { session }
        );
      }
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
