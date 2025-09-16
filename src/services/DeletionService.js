import mongoose from "mongoose";
import { Users } from "../models/Users.model.js";
import { Question } from "../models/Question.model.js";
import { Professional } from "../models/Professional.model.js";

export const accountDeletionService = {

  scheduleProfileDeletion: async (userId, profileType) => {
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 5);

    if (profileType === "asker") {
      await Users.findByIdAndUpdate(userId, {
        isAskerDeleted: true,
        deletionScheduledAt: deletionDate,
      });
    } else if (profileType === "professional") {
      await Users.findByIdAndUpdate(userId, {
        isProDeleted: true,
        deletionScheduledAt: deletionDate,
      });

      // Update professional status
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

    // Common anonymization
    await Users.findByIdAndUpdate(
      user._id,
      {
        email: `deleted_${user._id}@anonymous.com`,
        firstName: "Deleted",
        lastName: "User",
        phone: null,
        profilePic: null,
        anonymizedAt: new Date(),
      },
      { session }
    );

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
            title: "Former Professional",
            about: ["This professional has removed their account."],
            professionalExperiences: [],
            exampleQuestions: [],
            tags: [],
            socialLinks: [],
            verified: false,
            featured: false,
          },
          { session }
        );
        
        // Then remove the professional reference from the user
        await Users.findByIdAndUpdate(
          user._id,
          {
            $set: {
              roles: user.roles.filter(r => r !== 'professional'),
              activeRole: user.activeRole === 'professional' ? null : user.activeRole
            },
            $unset: { professional: "" }
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
