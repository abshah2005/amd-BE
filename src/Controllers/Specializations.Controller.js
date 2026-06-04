import { SpecializationModel } from "../models/SpecializationSchema.model.js";
import { Users } from "../models/Users.model.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import { asynchandler } from "../utils/Asynchandler.js";
import mongoose from "mongoose";


export const createSpecialization = asynchandler(async (req, res) => {
  const {category, subCategories } = req.body;
  
  const specialization = await SpecializationModel.create({ category, subCategories });
  return res.status(201).json(new Apiresponse(201, specialization, "Specialization created"));
});

export const createSpecializationsBulk = asynchandler(async (req, res) => {
  const payload = req.body;
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Apierror(400, "Payload must be a non-empty array of { category, subCategories }");
  }

  const ops = payload.map(({ category, subCategories = [] }) => ({
    updateOne: {
      filter: { category },
      update: { $setOnInsert: { category, subCategories } },
      upsert: true,
    },
  }));

  const result = await SpecializationModel.bulkWrite(ops, { ordered: false });
  const createdCount = result.upsertedCount || 0;

  const categories = payload.map((p) => p.category);
  const specializations = await SpecializationModel.find({ category: { $in: categories } });

  return res
    .status(201)
    .json(
      new Apiresponse(
        201,
        { totalRequested: payload.length, created: createdCount, specializations },
        "Bulk specializations processed"
      )
    );
});


export const getSpecialization = asynchandler(async (req, res) => {
  const { id } = req.params;
  const specialization = await SpecializationModel.findById(id);
  if (!specialization) throw new Apierror(404, "Specialization not found");
  return res.status(200).json(new Apiresponse(200, specialization, "Specialization fetched"));
});
export const getTopSpecializations = asynchandler(async (req, res) => {
  const { limit = 5 } = req.query;
  
  const topCategories = await Users.aggregate([
    { $match: { role: "professional" } },
    { $lookup: {
        from: "professionals",
        localField: "professional",
        foreignField: "_id",
        as: "professionalDoc"
    }},
    { $unwind: "$professionalDoc" },
    { $unwind: "$professionalDoc.selectedSpecializations" },
    {
      $lookup: {
        from: "specializations",
        localField: "professionalDoc.selectedSpecializations.specialization",
        foreignField: "_id",
        as: "specializationDetails"
      }
    },
    { $unwind: "$specializationDetails" },
    {
      $group: {
        _id: "$specializationDetails._id",
        category: { $first: "$specializationDetails.category" },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: parseInt(limit) }
  ]);

  if (topCategories.length === 0) {
    const allCategories = await SpecializationModel.find().limit(parseInt(limit));
    return res.status(200).json(new Apiresponse(200, allCategories, "All specializations fetched"));
  }

  return res.status(200).json(new Apiresponse(200, topCategories, "Top specializations fetched"));
});

// Update specialization
export const updateSpecialization = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { category, subCategories } = req.body;
  const specialization = await SpecializationModel.findByIdAndUpdate(
    id,
    { category, subCategories },
    { new: true }
  );
  if (!specialization) throw new Apierror(404, "Specialization not found");
  return res.status(200).json(new Apiresponse(200, specialization, "Specialization updated"));
});

// Delete specialization
export const deleteSpecialization = asynchandler(async (req, res) => {
  const { id } = req.params;
  const specialization = await SpecializationModel.findByIdAndDelete(id);
  if (!specialization) throw new Apierror(404, "Specialization not found");
  // Remove from professionals' arrays
  const Professional = mongoose.model("Professional");
  await Professional.updateMany(
    { 'selectedSpecializations.specialization': id },
    { $pull: { selectedSpecializations: { specialization: id } } }
  );
  return res.status(200).json(new Apiresponse(200, null, "Specialization deleted"));
});

export const getAllSpecializations = asynchandler(async (req, res) => {
  const specs = await SpecializationModel.find({});
  return res.status(200).json(new Apiresponse(200, specs, "All specializations fetched"));
});