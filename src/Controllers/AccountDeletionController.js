import { Users } from "../models/Users.model.js";
import { Professional } from "../models/Professional.model.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import { accountDeletionService } from "../services/DeletionService.js";

const requestProfileDeletion = async (req, res) => {
  try {
    const userId = req.user._id;
    const { profileType } = req.body;

    if (!["asker", "professional"].includes(profileType)) {
      return res.status(400).json({ message: "Invalid profile type" });
    }

    // user-initiated deletion (not admin)
    const result = await accountDeletionService.scheduleProfileDeletion(
      userId,
      profileType,
      { adminInitiated: false },
    );

    return res.status(200).json({
      message: `Your ${profileType} profile will be permanently deleted on ${result.scheduledDeletionDate.toDateString()}`,
      scheduledDate: result.scheduledDeletionDate,
    });
  } catch (error) {
    console.error("Error scheduling profile deletion:", error);
    return res
      .status(500)
      .json({ message: "Failed to process deletion request" });
  }
};

const requestProfileDeletionAdmin = async (req, res) => {
  try {
    const { userId, profileType } = req.body;
    const adminId = req.user._id;

    if (!["asker", "professional"].includes(profileType)) {
      return res.status(400).json({ message: "Invalid profile type" });
    }

    // Admin-initiated deletion: mark admin flag so user cannot cancel
    const result = await accountDeletionService.scheduleProfileDeletion(
      userId,
      profileType,
      { adminInitiated: true, adminId },
    );

    return res.status(200).json({
      message: `This ${profileType} profile will be permanently deleted on ${result.scheduledDeletionDate.toDateString()}`,
      scheduledDate: result.scheduledDeletionDate,
    });
  } catch (error) {
    console.error("Error scheduling profile deletion:", error);
    return res
      .status(500)
      .json({ message: "Failed to process deletion request" });
  }
};

// Cancel pending deletion
const cancelProfileDeletion = async (req, res) => {
  try {
    const userId = req.user._id;
    const { profileType } = req.body;
    const user = await Users.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    // Prevent user from cancelling if the deletion was initiated by an admin
    if (profileType === "professional" && user.isProDeletedByAdmin) {
      return res
        .status(403)
        .json({
          message:
            "This deletion was initiated by an administrator and cannot be cancelled by the user.",
        });
    }
    if (profileType === "asker" && user.isAskerDeletedByAdmin) {
      return res
        .status(403)
        .json({
          message:
            "This deletion was initiated by an administrator and cannot be cancelled by the user.",
        });
    }

    if (profileType === "asker") {
      await Users.findByIdAndUpdate(userId, {
        isAskerDeleted: false,
        deletionScheduledAt: null,
        isAskerDeletedByAdmin: false,
        adminRequestedDeletionBy: null,
      });
    } else if (profileType === "professional") {
      await Users.findByIdAndUpdate(userId, {
        isProDeleted: false,
        deletionScheduledAt: null,
        isProDeletedByAdmin: false,
        adminRequestedDeletionBy: null,
      });

      await Professional.findOneAndUpdate(
        { user: userId },
        { status: "active" },
      );
    }

    return res.status(200).json({
      message: `Your ${profileType} profile deletion has been cancelled.`,
    });
  } catch (error) {
    console.error("Error cancelling profile deletion:", error);
    return res
      .status(500)
      .json({ message: "Failed to cancel deletion request" });
  }
};

const cancelProfileDeletionAdmin = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { userId, profileType } = req.body;

    if (!userId || !["asker", "professional"].includes(profileType)) {
      return res.status(400).json({ message: "Invalid parameters" });
    }

    const user = await Users.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    // If there's no scheduled deletion, nothing to cancel
    if (!user.deletionScheduledAt) {
      return res
        .status(400)
        .json({ message: "No scheduled deletion found for this user" });
    }

    // Clear deletion flags (admin is allowed to cancel regardless of who initiated)
    if (profileType === "asker") {
      await Users.findByIdAndUpdate(userId, {
        isAskerDeleted: false,
        deletionScheduledAt: null,
        isAskerDeletedByAdmin: false,
        adminRequestedDeletionBy: null,
      });
    } else {
      await Users.findByIdAndUpdate(userId, {
        isProDeleted: false,
        deletionScheduledAt: null,
        isProDeletedByAdmin: false,
        adminRequestedDeletionBy: null,
      });

      await Professional.findOneAndUpdate(
        { user: userId },
        { status: "active" },
      );
    }

    return res.status(200).json({
      message: `Admin has cancelled the ${profileType} profile deletion for user ${userId}.`,
    });
  } catch (error) {
    console.error("Error cancelling profile deletion by admin:", error);
    return res
      .status(500)
      .json({ message: "Failed to cancel deletion request" });
  }
};

// Add this function to check if a user can create a professional account
const canCreateProfessionalAccount = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const user = await Users.findById(userId);

  if (!user) throw new Apierror(404, "User not found");

  // User can create a professional account if:
  // 1. They don't have a professional reference
  // 2. They're not in the process of deleting a professional account
  const canCreate = !user.professional && !user.isProDeleted;

  return res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { canCreateProfessional: canCreate },
        canCreate
          ? "You can create a professional account"
          : "You cannot create a professional account at this time",
      ),
    );
});

export {
  requestProfileDeletionAdmin,
  requestProfileDeletion,
  cancelProfileDeletion,
  canCreateProfessionalAccount,
  cancelProfileDeletionAdmin
};
