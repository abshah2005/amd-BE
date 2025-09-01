import mongoose from "mongoose";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import { Professional } from "../models/Professional.model.js";
import { Users } from "../models/Users.model.js";
import { Asker } from "../models/Asker.model.js";

const userPublicSelect = {
  "user.firstName": 1,
  "user.lastName": 1,
  "user.profilePic": 1,
  "user.email": 1,
};

const parseSort = (sortStr) => {
  const s = String(sortStr || "-rating").trim();
  const out = {};
  if (s.startsWith("-")) out[s.slice(1)] = -1;
  else if (s.startsWith("+")) out[s.slice(1)] = 1;
  else out[s] = 1;
  return out;
};

const getProfessionalByFullName = asynchandler(async (req, res) => {

  let { fullName } = req.params;
  if (!fullName) {
    throw new Apierror(400, "Full name is required");
  }

  fullName = fullName.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

  const parts = fullName.split(" ");
  if (parts.length < 2) {
    throw new Apierror(400, "Full name must include first and last name");
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");

  const user = await Users.findOne({
    firstName: new RegExp(`^${firstName}$`, "i"),
    lastName: new RegExp(`^${lastName}$`, "i"),
    roles: "professional",
  });

  if (!user) {
    throw new Apierror(404, "Professional not found");
  }

  const professional = await Professional.findOne({ user: user._id }).lean();
  if (!professional) {
    throw new Apierror(404, "Professional profile not found");
  }

  const response = {
    _id: professional._id,
    title: professional.title,
    userId: user._id,
    email: user.email,
    profilePic: user.profilePic,
    firstName: user.firstName,
    lastName: user.lastName,
    tags: professional.tags,
    entityType: professional.entityType,
    deliveryTime: professional.deliveryTime,
    firmName: professional.firmName,
    exampleQuestions: professional.exampleQuestions,
    languages: professional.languages,
    country: professional.country,
    priceRangeLow: professional.priceRangeLow,
    about: professional.about,
    currency: professional.currency,
    priceRangeHigh: professional.priceRangeHigh,
    isActive: user.isActive,
    verified: professional.verified,
    joinedDate: professional.createdAt,
    featured: professional.featured,
    feedbacks:professional.feedbacks,
    totalAnswers: 20,
    totalEarnings: 20,
    rating: professional.rating,
    ratingCount: professional.ratingCount,
    categories: Array.isArray(professional.selectedSpecializations)
      ? professional.selectedSpecializations.map(s => s.specialization?.toString())
      : [],
  };

  return res.status(200).json(
    new Apiresponse(200, response, "Professional public profile retrieved")
  );
});

const listProfessionals = asynchandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    q,
    tag,
    category,
    minPrice,
    maxPrice,
    verified,
    featured,
    country,
    sort = "-rating",
  } = req.query;

  const pageNum = Math.max(1, Number(page));
  const lim = Math.max(1, Math.min(100, Number(limit)));
  const skip = (pageNum - 1) * lim;
  const sortObj = parseSort(sort);

  // Build match clauses (supports multiple filters; multi-values are comma separated)
  const matchClauses = [];

  if (q) {
    const re = new RegExp(String(q).trim(), "i");
    matchClauses.push({
      $or: [
        { title: re },
        { about: re },
        { tags: re },
        { subcategories: re },
        { associated: re },
      ],
    });
  }

  // tags: comma separated -> require all selected tags to be present
  if (req.query.tags) {
    const tagsArr = String(req.query.tags)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagsArr.length) matchClauses.push({ tags: { $all: tagsArr } });
  } else if (tag) {
    // backward-compat single tag param
    matchClauses.push({ tags: String(tag) });
  }

  if (country || req.query.country) {
    const countries = req.query.country
      ? String(req.query.country).split(",").map((c) => c.trim()).filter(Boolean)
      : [String(country)];
    if (countries.length) matchClauses.push({ country: { $in: countries } });
  }

  if (featured !== undefined) matchClauses.push({ featured: String(featured) === "true" });

  if (minPrice) matchClauses.push({ priceRangeLow: { $gte: Number(minPrice) } });
  if (maxPrice) matchClauses.push({ priceRangeHigh: { $lte: Number(maxPrice) } });

  // delivery: comma separated thresholds -> accept if deliveryTime <= any selected threshold
  if (req.query.delivery) {
    const deliveryArr = String(req.query.delivery)
      .split(",")
      .map((d) => Number(d))
      .filter((n) => !Number.isNaN(n));
    if (deliveryArr.length) {
      matchClauses.push({
        $or: deliveryArr.map((d) => ({ deliveryTime: { $lte: d } })),
      });
    }
  }

  // rating: comma separated thresholds -> accept if rating >= any threshold
  if (req.query.rating) {
    const ratingArr = String(req.query.rating)
      .split(",")
      .map((r) => Number(r))
      .filter((n) => !Number.isNaN(n));
    if (ratingArr.length) {
      matchClauses.push({
        $or: ratingArr.map((r) => ({ rating: { $gte: r } })),
      });
    }
  }

  // languages: require all selected languages (frontend uses language.every)
  if (req.query.language) {
    const langs = String(req.query.language).split(",").map((l) => l.trim()).filter(Boolean);
    if (langs.length) matchClauses.push({ languages: { $all: langs } });
  }

  // verified boolean
  if (req.query.verified !== undefined) {
    const v = req.query.verified === "true" || req.query.verified === true;
    matchClauses.push({ verified: v });
  } else if (verified !== undefined) {
    matchClauses.push({ verified: String(verified) === "true" });
  }

  // selected category: can be ObjectId (specialization id) or a string category name
  if (req.query.category) {
    const cat = String(req.query.category);
    if (mongoose.Types.ObjectId.isValid(cat)) {
      matchClauses.push({ "selectedSpecializations.specialization": new mongoose.Types.ObjectId(cat) });
    } else {
      matchClauses.push({
        $or: [
          { "selectedSpecializations.category": cat },
          { tags: cat },
        ],
      });
    }
  } else if (category) {
    if (mongoose.Types.ObjectId.isValid(String(category))) {
      matchClauses.push({ "selectedSpecializations.specialization": new mongoose.Types.ObjectId(String(category)) });
    } else {
      matchClauses.push({
        $or: [
          { "selectedSpecializations.category": String(category) },
          { tags: String(category) },
        ],
      });
    }
  }

  // create final profMatch as $and of clauses (if none - match all)
  const profMatch = matchClauses.length ? { $and: matchClauses } : {};

  var ans=20;
  const excludeCurrentUser =
    req.user &&
    Array.isArray(req.user.roles) &&
    req.user.roles.includes("professional") &&
    mongoose.Types.ObjectId.isValid(String(req.user._id));

  const userMatch = { "user.roles": "professional" };
  if (excludeCurrentUser) {
    userMatch["user._id"] = { $ne: new mongoose.Types.ObjectId(String(req.user._id)) };
  }

  const pipeline = [
    { $match: profMatch },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    
    {
      $lookup: {
        from: "feedbacks",
        let: { fIds: "$feedbacks" },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: [
                  "$_id",
                  { $ifNull: ["$$fIds", []] }
                ]
              }
            }
          },
          { $sort: { createdAt: -1 } },
          // include asker basic info
          {
            $lookup: {
              from: "users",
              localField: "asker",
              foreignField: "_id",
              as: "asker"
            }
          },
          { $unwind: { path: "$asker", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              rating: 1,
              comment: 1,
              createdAt: 1,
              asker: {
                _id: "$asker._id",
                firstName: "$asker.firstName",
                lastName: "$asker.lastName",
                profilePic: "$asker.profilePic",
                email: "$asker.email"
              }
            }
          }
        ],
        as: "feedbacks"
      }
    },



    {
      // $match: {
      //   "user.roles": "professional",
        
      // },
      $match: userMatch
    },
    {
      $facet: {
        data: [
          { $sort: sortObj },
          { $skip: skip },
          { $limit: lim },
          {
            $project: {
              _id: 1,
              title: 1,
              userId: "$user._id",
              email: "$user.email",
              profilePic: "$user.profilePic",
              firstName: "$user.firstName",
              lastName: "$user.lastName",
              tags: 1,
              entityType: 1,
              feedbacks:1,
              deliveryTime: 1,
              firmName: 1,
              exampleQuestions: 1,
              languages: 1,
              country: 1,
              priceRangeLow: 1,
              about:1,
              currency:1,
              priceRangeHigh: 1,
              isActive:"$user.isActive",
              verified: 1,
              joinedDate:"$createdAt",
              featured: 1,
              totalAnswers: { $literal: ans },
              totalEarnings: { $literal: ans },
              rating: 1,
              ratingCount: 1,
              categories: {
                $cond: [
                  { $isArray: "$selectedSpecializations" },
                  {
                    $map: {
                      input: "$selectedSpecializations",
                      as: "s",
                      in: { $toString: "$$s.specialization" },
                    },
                  },
                  [],
                ],
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ];

  const aggResult = await Professional.aggregate(pipeline).allowDiskUse(true);
  const data = aggResult[0].data || [];
  const total =
    (aggResult[0].total &&
      aggResult[0].total[0] &&
      aggResult[0].total[0].count) ||
    0;
  
  

  return res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { results: data, page: pageNum, limit: lim, total },
        "Professionals retrieved"
      )
    );
});

const getProfessionalById = asynchandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new Apierror(400, "Invalid professional id");

  const prof = await Professional.findById(id)
    .populate({
      path: "user",
      select: "firstName lastName profilePic email roles activeRole",
    })
    .lean();
  if (!prof) throw new Apierror(404, "Professional not found");

  if (prof.user) {
    delete prof.user.refreshToken;
    delete prof.user.accessToken;
  }

  return res
    .status(200)
    .json(new Apiresponse(200, prof, "Professional profile retrieved"));
});

const getTopProfessionals = asynchandler(async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit || 6));
  const docs = await Professional.aggregate([
    { $match: { featured: true } },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.roles": "professional",
        "user.activeRole": "professional",
      },
    },
    { $sort: { rating: -1, ratingCount: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        title: 1,
        tags: 1,
        rating: 1,
        ratingCount: 1,
        user: {
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          profilePic: "$user.profilePic",
          email: "$user.email",
          _id: "$user._id",
        },
      },
    },
  ]).allowDiskUse(true);

  return res
    .status(200)
    .json(new Apiresponse(200, docs, "Top professionals retrieved"));
});

const getProfessionalsBySpecialization = asynchandler(async (req, res) => {
  const { specializationId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(specializationId))
    throw new Apierror(400, "Invalid specialization id");

  const limit = Number(req.query.limit || 50);
  const docs = await Professional.aggregate([
    {
      $match: {
        "selectedSpecializations.specialization":
          mongoose.Types.ObjectId(specializationId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.roles": "professional",
        "user.activeRole": "professional",
      },
    },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        title: 1,
        tags: 1,
        user: {
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          profilePic: "$user.profilePic",
          email: "$user.email",
          _id: "$user._id",
        },
      },
    },
  ]).allowDiskUse(true);

  return res
    .status(200)
    .json(
      new Apiresponse(200, docs, "Professionals by specialization retrieved")
    );
});

const listAskers = asynchandler(async (req, res) => {
  const { page = 1, limit = 20, q } = req.query;
  const pageNum = Math.max(1, Number(page));
  const lim = Math.max(1, Math.min(100, Number(limit)));
  const skip = (pageNum - 1) * lim;

  const match = {};
  if (q) {
    const re = new RegExp(String(q).trim(), "i");
    match.$or = [{ "user.firstName": re }, { "user.lastName": re }];
  }

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
    {
      $match: {
        "user.roles": "asker",
        "user.activeRole": "asker",
        ...(match.$or ? { $or: match.$or } : {}),
      },
    },
    {
      $facet: {
        data: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: lim },
          {
            $project: {
              _id: 1,
              firstName: "$user.firstName",
              lastName: "$user.lastName",
              profilePic: "$user.profilePic",
              email: "$user.email",
              userId: "$user._id",
              createdAt: 1,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ];

  const aggResult = await Asker.aggregate(pipeline).allowDiskUse(true);
  const data = aggResult[0].data || [];
  const total =
    (aggResult[0].total &&
      aggResult[0].total[0] &&
      aggResult[0].total[0].count) ||
    0;

  return res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { results: data, page: pageNum, limit: lim, total },
        "Askers retrieved"
      )
    );
});

const getAskerById = asynchandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    throw new Apierror(400, "Invalid asker id");

  const a = await Asker.findById(id)
    .populate({
      path: "user",
      select: "firstName lastName profilePic email roles activeRole",
    })
    .lean();
  if (!a) throw new Apierror(404, "Asker not found");
  if (
    !(
      Array.isArray(a.user?.roles) &&
      a.user.roles.includes("asker") &&
      a.user.activeRole === "asker"
    )
  ) {
    throw new Apierror(404, "Asker not available");
  }
  return res.status(200).json(new Apiresponse(200, a, "Asker retrieved"));
});

export {
  listProfessionals,
  getProfessionalById,
  getTopProfessionals,
  getProfessionalsBySpecialization,
  listAskers,
  getAskerById,
  getProfessionalByFullName
};
