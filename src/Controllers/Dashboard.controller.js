import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Users } from "../models/Users.model.js";
import { Professional } from "../models/Professional.model.js";
import { Asker } from "../models/Asker.model.js";

// Dashboard summary stats
export const getDashboardStats = asynchandler(async (req, res) => {
  const totalUsers = await Users.countDocuments().where({isAdmin:false});
  const activeUsers = await Users.countDocuments({ isActive: true });
  const totalPlatformEarnings = 2; // TODO: aggregate from payments
  const avgRating = 3.5; // TODO: aggregate from reviews

  res.status(200).json(new Apiresponse(200, {
    totalUsers,
    activeUsers,
    totalPlatformEarnings,
    avgRating,
  }, "Dashboard stats"));
});

// Paginated users for dashboard tables
export const listDashboardUsers = asynchandler(async (req, res) => {
  const { type = "professional", page = 1, limit = 20 } = req.query;
  const Model = type === "asker" ? Asker : Professional;
  const skip = (page - 1) * limit;

  const pipeline = [
    { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $match: { "user.roles": type, "user.activeRole": type } },
    { $sort: { "user.createdAt": -1 } },
    { $skip: skip },
    { $limit: Number(limit) },
    {
      $project: {
        _id: 1,
        name: { $concat: ["$user.firstName", " ", "$user.lastName"] },
        joinedDate: "$user.createdAt",
        email: "$user.email",
        profilePic: "$user.profilePic",
        totalEarnings: { $literal: 0 },
        totalSpendings: { $literal: 0 },
        questionsAsked: { $literal: 0 },
        questionsAnswered: { $literal: 0 },
        status: { $cond: [{ $eq: ["$user.isActive", true] }, true, false] },
      }
    }
  ];

  const data = await Model.aggregate(pipeline);
  res.status(200).json(new Apiresponse(200, { results: data, page, limit }, "Users list"));
});