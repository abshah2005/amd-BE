import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Users } from "../models/Users.model.js";
import { Professional } from "../models/Professional.model.js";
import { Asker } from "../models/Asker.model.js";
import { Question } from "../models/Question.model.js";

export const getDashboardStats = asynchandler(async (req, res) => {
  const totalUsers = await Users.countDocuments({ isAdmin: false });

  const activeUsers = await Users.countDocuments({ isActive: true,isAdmin:false });

  const earningsAgg = await Question.aggregate([
    { $match: { "payment.paid": true } },
    { $group: { _id: null, total: { $sum: { $ifNull: ["$price", 0] } } } },
  ]).allowDiskUse(true);

  const totalPlatformEarnings = earningsAgg[0]?.total || 0;

  const ratingAgg = await Professional.aggregate([
    { $match: { rating: { $exists: true, $ne: null } } },
    { $group: { _id: null, avgRating: { $avg: "$rating" } } },
  ]).allowDiskUse(true);

  const avgRating = ratingAgg[0]?.avgRating
    ? Number(ratingAgg[0].avgRating.toFixed(2))
    : 0;

  res.status(200).json(
    new Apiresponse(
      200,
      {
        totalUsers,
        activeUsers,
        totalPlatformEarnings,
        avgRating,
      },
      "Dashboard stats"
    )
  );
});

export const getProfessionalDashboardStats = asynchandler(async (req, res) => {
  const professionalId = req.user.professional?._id;
  if (!professionalId) throw new Apierror(403, "Not a professional");

  const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "12");
  const EARLY_CLOSE_PENALTY_PERCENT = parseFloat(process.env.EARLY_CLOSE_PENALTY_PERCENT || "3");

  const activeQuestions = await Question.countDocuments({
    professional: professionalId,
    status: { $nin: ["closed", "rejected"] },
  });

  const questionsCompleted = await Question.countDocuments({
    professional: professionalId,
    status: "closed",
  });

  // const earningsAgg = await Question.aggregate([
  //   { $match: { professional: professionalId, "payment.paid": true } },
  //   { $group: { _id: null, total: { $sum: "$price" } } },
  // ]);
  // const totalEarnings = earningsAgg[0]?.total || 0;

  const netAgg = await Question.aggregate([
    {
      $match: {
        professional: professionalId,
        "payment.paid": true,
        status: "closed",
      },
    },
    {
      $project: {
        price: { $ifNull: ["$price", 0] },
        threadClosedEarlier: "$thread.threadClosedEarlier",
      },
    },
    {
      $addFields: {
        feePercent: {
          $cond: [
            "$threadClosedEarlier",
            PLATFORM_FEE_PERCENT + EARLY_CLOSE_PENALTY_PERCENT,
            PLATFORM_FEE_PERCENT,
          ],
        },
      },
    },
    {
      $project: {
        net: {
          $multiply: [
            "$price",
            { $subtract: [1, { $divide: ["$feePercent", 100] }] },
          ],
        },
      },
    },
    {
      $group: { _id: null, netTotal: { $sum: "$net" } },
    },
  ]).allowDiskUse(true);
  const netReceived = Math.round((netAgg[0]?.netTotal || 0) * 100) / 100;

  const prof = await Professional.findById(professionalId);
  const pendingPayouts=prof?.pendingPayouts || [];
  const normalize = (s) => String(s || "").replace(/\s+/g, "");
  await prof.populate("user", "firstName lastName");
  const avgRating = prof?.rating || 0;

  res.status(200).json(
    new Apiresponse(
      200,
      {
        activeQuestions,
        questionsCompleted,
        avgRating,
        pendingPayouts,
        totalEarnings:netReceived,
        shareUrl:  `${process.env.FRONTEND_URL}/profile/${normalize(
          prof.user.firstName
        )}_${normalize(prof.user.lastName)}`,
      },
      "Dashboard stats"
    )
  );
});

export const getProfessionalPendingQuestions = asynchandler(
  async (req, res) => {
    const professionalId = req.user.professional?._id;
    if (!professionalId) throw new Apierror(403, "Not a professional");

    const questions = await Question.find({
      professional: professionalId,
      status: { $nin: ["closed", "rejected"] },
    })
      .sort({ createdAt: -1 })
      .populate("asker");

    res.status(200).json(new Apiresponse(200, questions, "Pending questions"));
  }
);

export const listDashboardUsers = asynchandler(async (req, res) => {
  const { type = "professional", page = 1, limit = 20 } = req.query;
  const Model = type === "asker" ? Asker : Professional;
  const pageNum = Math.max(1, Number(page));
  const lim = Math.max(1, Math.min(100, Number(limit)));
  const skip = (pageNum - 1) * lim;

  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    { $match: { "user.roles": type, 
      // "user.activeRole": type
     } },
    { $sort: { "user.createdAt": -1 } },
    { $skip: skip },
    { $limit: lim },
  ];

  if (type === "professional") {
    pipeline.push(
      {
        $lookup: {
          from: "questions",
          let: { profId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$professional", "$$profId"] } } },
            {
              $group: {
                _id: null,
                totalCount: { $sum: 1 },
                answeredCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$payment.paid", true] },
                          { $eq: ["$status", "closed"] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                paidEarnings: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$payment.paid", true] },
                          { $eq: ["$status", "closed"] },
                        ],
                      },
                      { $ifNull: ["$price", 0] },
                      0,
                    ],
                  },
                },
              },
            },
          ],
          as: "qAgg",
        },
      },
      {
        $project: {
          _id: 1,
          name: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          joinedDate: "$user.createdAt",
          email: "$user.email",
          profilePic: "$user.profilePic",
          totalEarnings: {
            $ifNull: [{ $arrayElemAt: ["$qAgg.paidEarnings", 0] }, 0],
          },
          totalSpendings: { $literal: 0 },
          questionsAsked: { $literal: 0 },
          questionsAnswered: {
            $ifNull: [{ $arrayElemAt: ["$qAgg.answeredCount", 0] }, 0],
          },
          featured: "$featured", 
          verified: "$verified",
          status: { $cond: [{ $eq: ["$user.isActive", true] }, true, false] },
        },
      }
    );
  } else {
    pipeline.push(
      {
        $lookup: {
          from: "questions",
          let: { userId: "$user._id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$asker", "$$userId"] } } },
            {
              $group: {
                _id: null,
                totalCount: { $sum: 1 },
                paidTotal: {
                  $sum: {
                    $cond: [
                      { $eq: ["$payment.paid", true] },
                      { $ifNull: ["$price", 0] },
                      0,
                    ],
                  },
                },
              },
            },
          ],
          as: "qAgg",
        },
      },
      {
        $project: {
          _id: 1,
          name: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          joinedDate: "$user.createdAt",
          email: "$user.email",
          profilePic: "$user.profilePic",
          totalEarnings: { $literal: 0 },
          totalSpendings: {
            $ifNull: [{ $arrayElemAt: ["$qAgg.paidTotal", 0] }, 0],
          },
          questionsAsked: {
            $ifNull: [{ $arrayElemAt: ["$qAgg.totalCount", 0] }, 0],
          },
          questionsAnswered: { $literal: 0 },
          status: { $cond: [{ $eq: ["$user.isActive", true] }, true, false] },
        },
      }
    );
  }

  const data = await Model.aggregate(pipeline).allowDiskUse(true);
  res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { results: data, page: pageNum, limit: lim },
        "Users list"
      )
    );
});
