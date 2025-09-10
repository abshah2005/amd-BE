import { uploadOnS3 } from "../utils/Fileupload.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import axios from "axios";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Users } from "../models/Users.model.js";
import { Professional } from "../models/Professional.model.js";
import { Asker } from "../models/Asker.model.js";
import { Admin } from "../models/Admin.model.js";
import { sendEmail } from "../utils/Nodemailer.js";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await Users.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new Apierror(500, "Error generating access and refresh tokens");
  }
};

const registerStep1 = asynchandler(async (req, res) => {
  const { email, password, authProvider } = req.body;

  if (!email || (!password && authProvider === "email")) {
    throw new Apierror(
      400,
      "Email is required and password is required for email signup"
    );
  }

  const existingUser = await Users.findOne({ email });

  if (existingUser && existingUser.isRegistrationComplete) {
    throw new Apierror(400, "User with this email already exists");
  }

  if (authProvider === "linkedin") {
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = existingUser
      ? await Users.findOneAndUpdate(
          { email },
          {
            authProvider: "linkedin",
            password: await bcrypt.hash(tempPassword, 10),
            $setOnInsert: { registrationStep: 1 },
          },
          { new: true, upsert: true }
        )
      : await Users.create({
          email,
          password: tempPassword,
          authProvider: "linkedin",
          registrationStep: 1,
        });

    return res.status(200).json(
      new Apiresponse(
        200,
        {
          email: user.email,
          currentStep: user.registrationStep,
          authProvider: "linkedin",
          isRegistrationComplete: user.isRegistrationComplete,
        },
        "Authentication successful"
      )
    );
  }

  const user = existingUser
    ? await Users.findOneAndUpdate(
        { email },
        {
          password: await bcrypt.hash(password, 10),
          authProvider: "email",
          $setOnInsert: { registrationStep: 1 },
        },
        { new: true, upsert: true }
      )
    : await Users.create({
        email,
        password,
        authProvider: "email",
        registrationStep: 1,
      });

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        email: user.email,
        currentStep: user.registrationStep,
        authProvider: "email",
        isRegistrationComplete: user.isRegistrationComplete,
      },
      "Step 1 completed"
    )
  );
});

const registerStep2 = asynchandler(async (req, res) => {
  const { email, role, isAdmin } = req.body;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email });

  if (!user) {
    throw new Apierror(404, "User not found - please complete step 1 first");
  }

  let updateFields = {
    role,
    registrationStep: 2,
  };

  if (user.authProvider === "linkedin") {
    updateFields.isRegistrationComplete = true;
    updateFields.registrationStep = 3;
  }

  if (isAdmin) {
    updateFields.isAdmin = true;
  }

  const updatedUser = await Users.findOneAndUpdate({ email }, updateFields, {
    new: true,
  });

  if (!updatedUser) throw new Apierror(500, "Failed to update user role");

  try {
    if (role === "professional") {
      if (!updatedUser.professional) {
        const profDoc = await Professional.create({ user: updatedUser._id });
        updatedUser.professional = profDoc._id;
      }

      if (!updatedUser.asker) {
        const askerDoc = await Asker.create({ user: updatedUser._id });
        updatedUser.asker = askerDoc._id;
      }

      updatedUser.roles = Array.from(
        new Set([...(updatedUser.roles || []), "professional", "asker"])
      );
    } else if (role === "asker") {
      if (!updatedUser.asker) {
        const askerDoc = await Asker.create({ user: updatedUser._id });
        updatedUser.asker = askerDoc._id;
      }
      updatedUser.roles = Array.from(
        new Set([...(updatedUser.roles || []), "asker"])
      );
    }

    if (isAdmin || role === "admin") {
      if (Admin) {
        if (!updatedUser.admin) {
          const adminDoc = await Admin.create({ user: updatedUser._id });
          updatedUser.admin = adminDoc._id;
        }
      }
      updatedUser.isAdmin = true;
      updatedUser.roles = Array.from(
        new Set([...(updatedUser.roles || []), "admin"])
      );
    }

    await updatedUser.save();
  } catch (err) {
    console.error("Error creating role child docs:", err);
    return res.status(200).json(
      new Apiresponse(
        200,
        {
          email: updatedUser.email,
          authProvider: updatedUser.authProvider,
          role: updatedUser.role,
          currentStep: updatedUser.registrationStep,
          isRegistrationComplete: updatedUser.isRegistrationComplete,
          warning: "Role set but failed to create all role documents on server",
        },
        "Role updated with warnings"
      )
    );
  }

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        email: updatedUser.email,
        authProvider: updatedUser.authProvider,
        role: updatedUser.role,
        currentStep: updatedUser.registrationStep,
        isRegistrationComplete: updatedUser.isRegistrationComplete,
      },
      "Role updated successfully"
    )
  );
});

const registerStep3 = asynchandler(async (req, res) => {
  const { email, firstName, lastName } = req.body;
  const profilePicPath = req.files?.profilePic?.[0];

  if (!email || !firstName || !lastName) {
    throw new Apierror(400, "Email, first name and last name are required");
  }
  let profilePicUrl = null;

  if (profilePicPath) {
    const uploadedPic = await uploadOnS3(profilePicPath);
    profilePicUrl =
      `https://${uploadedPic.bucket}.s3.amazonaws.com/${uploadedPic.key}` ||
      " ";
  }
  console.log(profilePicUrl);
  const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`;
  let username = baseUsername;
  let counter = 1;

  while (true) {
    const existingUser = await Users.findOne({
      username,
      email: { $ne: email },
    });
    if (!existingUser) break;
    username = `${baseUsername}${counter}`;
    counter++;
  }

  const updateFields = {
    firstName,
    lastName,
    profilePic: profilePicUrl,
    registrationStep: 3,
    isRegistrationComplete: true,
  };

  const updatedUser = await Users.findOneAndUpdate({ email }, updateFields, {
    new: true,
  }).select("-password -refreshToken");

  if (!updatedUser.activeRole) {
    if (updatedUser.isAdmin) {
      updatedUser.activeRole = "admin";
    } else if (updatedUser.role === "professional") {
      updatedUser.activeRole = "professional";
    } else if (updatedUser.role === "asker") {
      updatedUser.activeRole = "asker";
    }
    await updatedUser.save();
  }

  if (updatedUser.role === "professional") {
    if (!updatedUser.professional) {
      const profDoc = await Professional.create({
        user: updatedUser._id,
      });
      updatedUser.professional = profDoc._id;
      updatedUser.activeRole = "professional";
      await updatedUser.save();
    } else {
    }
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    updatedUser._id
  );

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        user: updatedUser,
        accessToken,
        refreshToken,
        currentStep: updatedUser.registrationStep,
        isRegistrationComplete: updatedUser.isRegistrationComplete,
      },
      "Profile updated successfully"
    )
  );
});

const registerStep4 = asynchandler(async (req, res) => {
  const { email } = req.body;
  const professionalPayload =
    typeof req.body.professional === "string"
      ? JSON.parse(req.body.professional)
      : req.body.professional || {};
  const profilePicPath = req.files?.profilePic?.[0];

  if (!email) throw new Apierror(400, "Email is required");

  const user = await Users.findOne({ email });
  if (!user) throw new Apierror(404, "User not found");
  if (user.role !== "professional")
    throw new Apierror(400, "Step 4 is only for professionals");

  let profilePicUrl = null;
  if (profilePicPath) {
    const uploaded = await uploadOnS3(profilePicPath);
    if (uploaded)
      profilePicUrl = `https://${uploaded.bucket}.s3.amazonaws.com/${uploaded.key}`;
  }

  const userUpdate = {};
  if (req.body.firstName) userUpdate.firstName = req.body.firstName;
  if (req.body.lastName) userUpdate.lastName = req.body.lastName;
  if (profilePicUrl) userUpdate.profilePic = profilePicUrl;
  if (Object.keys(userUpdate).length) {
    await Users.findByIdAndUpdate(
      user._id,
      { $set: userUpdate },
      { new: true, runValidators: true }
    );
  }

  const allowed = [
    "title",
    "about",
    "selectedSpecializations",
    "exampleQuestions",
    "languages",
    "socialLinks",
    "deliveryTime",
    "priceRangeLow",
    "priceRangeHigh",
    "currency",
    "profilePicture",
    "professionalExperiences",
    "location",
    "country",
    "tags",
    "subcategories",
    "entityType",
    "firmName",
    "verified",
    "featured",
  ];

  const profData = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(professionalPayload, key))
      profData[key] = professionalPayload[key];
    else if (Object.prototype.hasOwnProperty.call(req.body, key))
      profData[key] = req.body[key];
  }
  if (profilePicUrl && !profData.profilePicture)
    profData.profilePicture = profilePicUrl;

  let professionalDoc = null;
  if (Object.keys(profData).length) {
    if (user.professional) {
      professionalDoc = await Professional.findByIdAndUpdate(
        user.professional,
        { $set: profData },
        { new: true, runValidators: true }
      );
    } else {
      professionalDoc = await Professional.create({
        user: user._id,
        ...profData,
      });
      user.professional = professionalDoc._id;
      await user.save();
    }
  } else if (user.professional) {
    professionalDoc = await Professional.findById(user.professional);
  }

  const sanitizedUser = await Users.findById(user._id).select(
    "-password -refreshToken"
  );
  return res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { user: sanitizedUser, professional: professionalDoc },
        "Step 4 saved"
      )
    );
});

const registerStep5 = asynchandler(async (req, res) => {
  const { email } = req.body;
  const paymentList = Array.isArray(req.body.paymentMethods)
    ? req.body.paymentMethods
    : req.body.paymentMethod
    ? [req.body.paymentMethod]
    : req.body.payment
    ? [req.body.payment]
    : [];

  if (!email) throw new Apierror(400, "Email is required");

  const user = await Users.findOne({ email });
  if (!user) throw new Apierror(404, "User not found");
  if (user.role !== "professional")
    throw new Apierror(400, "Step 5 is only for professionals");

  const created = [];
  for (const p of paymentList) {
    if (!p || typeof p !== "object") continue;
    const pm = await user.addPaymentMethod(p);
    created.push(pm);
  }

  const sanitizedUser = await Users.findById(user._id).select(
    "-password -refreshToken"
  );
  return res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { user: sanitizedUser, paymentMethods: created },
        "Step 5 payment methods saved"
      )
    );
});

const getRegistrationState = asynchandler(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email }).select(
    "email registrationStep isRegistrationComplete role authProvider firstName lastName profilePic"
  );

  if (!user) {
    return res.status(200).json(
      new Apiresponse(
        200,
        {
          exists: false,
          currentStep: 0,
        },
        "No registration started with this email"
      )
    );
  }

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        exists: true,
        ...user.toObject(),
        currentStep: user.registrationStep,
      },
      "Registration state retrieved"
    )
  );
});

const linkedinCallback = asynchandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    throw new Apierror(400, "Authorization code is required");
  }

  try {
    const tokenResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log(`Access Token here ${accessToken}`);

    const userInfoResponse = await axios.get(
      "https://api.linkedin.com/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    console.log("functioon reaches here");
    const userInfo = userInfoResponse.data;

    const email = userInfo.email;
    const firstName = userInfo.given_name || userInfo.firstName || "Unknown";
    const lastName = userInfo.family_name || userInfo.lastName || "Unknown";
    const profilePicUrl = userInfo.picture || "";

    let user = await Users.findOne({ email });

    const tempPassword = Math.random().toString(36).slice(-10);

    if (!user) {
      user = await Users.create({
        email,
        firstName,
        lastName,
        password: tempPassword,
        profilePic: profilePicUrl,
        authProvider: "linkedin",
        registrationStep: 1,
      });
    } else {
      const updateFields = {
        firstName: user.firstName,
        lastName: user.lastName,
        activeRole: user.role,
        profilePic: user.profilePic,
        authProvider: "linkedin",
      };
      if (!user.password) {
        updateFields.password = await bcrypt.hash(tempPassword, 10);
      }
      user = await Users.findOneAndUpdate(
        { _id: user._id },
        { $set: updateFields },
        { new: true }
      );
    }

    if (user.isRegistrationComplete) {
      const { accessToken, refreshToken } =
        await generateAccessAndRefreshTokens(user._id);
      return res
        .status(200)
        .json(
          new Apiresponse(
            200,
            { user, accessToken, refreshToken },
            "LinkedIn login successful"
          )
        );
    }

    return res.status(200).json(
      new Apiresponse(
        200,
        {
          user,
        },
        "LinkedIn authentication successful"
      )
    );
  } catch (error) {
    console.error(
      "LinkedIn OAuth error:",
      error.response?.data || error.message
    );
    throw new Apierror(500, "LinkedIn authentication failed");
  }
});

const getLinkedInProfile = asynchandler(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email, authProvider: "linkedin" }).select(
    "firstName lastName profilePic linkedinProfileUrl"
  );

  if (!user) {
    throw new Apierror(404, "No LinkedIn account found with this email");
  }

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        firstName: user.firstName,
        lastName: user.lastName,
        profilePic: user.profilePic,
        linkedinProfileUrl: user.linkedinProfileUrl,
      },
      "LinkedIn profile data retrieved"
    )
  );
});

const Loginuser = asynchandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }
  if (!password) {
    throw new Apierror(400, "Password is required");
  }

  const user = await Users.findOne({ $or: [{ email }] });
  if (!user) {
    throw new Apierror(400, "User not found, please sign up first");
  }

  const isMatch = await user.isPasswordCorrect(password);
  if (!isMatch) {
    throw new Apierror(401, "Invalid credentials");
  }

  if (!user.isRegistrationComplete) {
    return res.status(200).json(
      new Apiresponse(
        200,
        {
          email: user.email,
          currentStep: user.registrationStep,
          isRegistrationComplete: false,
        },
        "Complete registration process"
      )
    );
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePic: user.profilePic,
        },
        accessToken,
        refreshToken,
      },
      "Logged in successfully"
    )
  );
});

const LogoutUser = asynchandler(async (req, res) => {
  const user = await Users.findByIdAndUpdate(
    req.user?._id,
    { $unset: { refreshToken: 1 },isActive:false,lastActiveAt:new Date() },
    { new: true }
  );
  if (!user) {
    throw new Apierror(400, "User not found");
  }
  res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json({ message: "Logged out successfully" });
});

const getCurrentUser = asynchandler(async (req, res) => {
  res.status(200).json(req.user);
});

const forgotPassword = asynchandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email });
  if (!user) {
    throw new Apierror(404, "User not found");
  }

  const resetToken = jwt.sign(
    { userId: user._id },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "1h" }
  );

  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000;
  await user.save();

  const resetLink = `${process.env.FRONTEND_URL}/resetPassword?token=${resetToken}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "Password Reset Request",
    html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link will expire in 1 hour.</p>`,
  };

  await sendEmail(mailOptions.to, mailOptions.subject, mailOptions.html);
  res
    .status(200)
    .json(new Apiresponse(200, null, "Password reset link sent to email"));
});

const resetPassword = asynchandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    throw new Apierror(400, "Token and new password are required");
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await Users.findById(decoded.userId);
    if (!user || user.resetPasswordExpires < Date.now()) {
      throw new Apierror(400, "Invalid or expired token");
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res
      .status(200)
      .json(new Apiresponse(200, null, "Password reset successfully"));
  } catch (error) {
    throw new Apierror(400, "Invalid or expired token");
  }
});

// const updateInfo = asynchandler(async (req, res) => {
//   const { firstName, lastName } = req.body;
//   const professionalPayload = req.body.professional || {};
//   const profilePicPath = req.files?.profilePic?.[0];

//   let profilePicUrl = null;
//   if (profilePicPath) {
//     const uploaded = await uploadOnS3(profilePicPath);
//     if (uploaded) {
//       profilePicUrl = `https://${uploaded.bucket}.s3.amazonaws.com/${uploaded.key}`;
//     }
//   }

//   if (typeof professionalPayload.selectedSpecializations === "string") {
//     try {
//       professionalPayload.selectedSpecializations = JSON.parse(
//         professionalPayload.selectedSpecializations
//       );
//     } catch (err) {
//       professionalPayload.selectedSpecializations = [];
//     }
//   }

//   const parseIfString = (val) => {
//   if (typeof val === "string") {
//     try {
//       return JSON.parse(val);
//     } catch {
//       return [];
//     }
//   }
//   return val;
// };

// // Parse all array/object fields from both professionalPayload and req.body
// const arrayFields = [
//   "selectedSpecializations",
//   "languages",
//   "locations",
//   "tags",
//   "exampleQuestions"
// ];

// arrayFields.forEach((field) => {
//   professionalPayload[field] = parseIfString(professionalPayload[field]);
//   req.body[field] = parseIfString(req.body[field]);
// });

//   const userUpdate = {};
//   if (firstName) userUpdate.firstName = firstName;
//   if (lastName) userUpdate.lastName = lastName;
//   if (profilePicUrl) userUpdate.profilePic = profilePicUrl;

//   const updatedUser = await Users.findByIdAndUpdate(
//     req.user._id,
//     { $set: userUpdate },
//     { new: true, runValidators: true }
//   ).select("-password -refreshToken");

//   if (!updatedUser) {
//     throw new Apierror(404, "User not found");
//   }

//   let updatedProfessional = null;
//   if (updatedUser.activeRole === "professional") {
//     const allowed = [
//       "title",
//       "about",
//       "selectedSpecializations",
//       "exampleQuestions",
//       "languages",
//       "priceRangeLow",
//       "priceRangeHigh",
//       "currency",
//       "profilePicture",
//       "location",
//       "country",
//       "tags",
//       "subcategories",
//       "verified",
//       "featured",
//       "deliveryTime",
//       "entityType",
//       "firmName",
//     ];

//     const toSet = {};
//     for (const key of allowed) {
//       if (Object.prototype.hasOwnProperty.call(professionalPayload, key)) {
//         toSet[key] = professionalPayload[key];
//       } else if (Object.prototype.hasOwnProperty.call(req.body, key)) {
//         toSet[key] = req.body[key];
//       }
//     }

//     // ensure profilePicture is set from uploaded pic when not provided explicitly
//     if (profilePicUrl && !toSet.profilePicture)
//       toSet.profilePicture = profilePicUrl;

//     if (Object.keys(toSet).length) {
//       if (updatedUser.professional) {
//         updatedProfessional = await Professional.findByIdAndUpdate(
//           updatedUser.professional,
//           { $set: toSet },
//           { new: true, runValidators: true }
//         );
//       } else {
//         updatedProfessional = await Professional.create({
//           user: updatedUser._id,
//           ...toSet,
//         });
//         updatedUser.professional = updatedProfessional._id;
//         await updatedUser.save();
//       }
//     } else if (updatedUser.professional) {
//       updatedProfessional = await Professional.findById(
//         updatedUser.professional
//       );
//     }
//   }

//   const payload = { user: updatedUser };
//   if (updatedProfessional) payload.professional = updatedProfessional;

//   res
//     .status(200)
//     .json(new Apiresponse(200, payload, "Profile updated successfully"));
// });


const updateInfo = asynchandler(async (req, res) => {
  const { firstName, lastName, description, priceRangeLow, priceRangeHigh, currency, entityType, firmName } = req.body;
  const professionalPayload = req.body.professional || {};
  const profilePicPath = req.files?.profilePic?.[0];

  let profilePicUrl = null;
  if (profilePicPath) {
    const uploaded = await uploadOnS3(profilePicPath);
    if (uploaded) {
      profilePicUrl = `https://${uploaded.bucket}.s3.amazonaws.com/${uploaded.key}`;
    }
  }

  const parseIfString = (val) => {
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return [];
      }
    }
    return val;
  };

  // Parse all array/object fields from req.body
  const arrayFields = [
    "languages",
    "locations",
    "tags",
    "selectedSpecializations",
    "professionalExperiences",
    "socialLinks",
    "exampleQuestions",
  ];

  arrayFields.forEach((field) => {
    req.body[field] = parseIfString(req.body[field]);
  });

  const userUpdate = {};
  if (firstName) userUpdate.firstName = firstName;
  if (lastName) userUpdate.lastName = lastName;
  if (profilePicUrl) userUpdate.profilePic = profilePicUrl;

  const updatedUser = await Users.findByIdAndUpdate(
    req.user._id,
    { $set: userUpdate },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  if (!updatedUser) {
    throw new Apierror(404, "User not found");
  }

  let updatedProfessional = null;
  if (updatedUser.activeRole === "professional") {
    const allowed = [
      "about",
      "selectedSpecializations",
      "exampleQuestions",
      "professionalExperiences",
      "socialLinks",
      "languages",
      "priceRangeLow",
      "priceRangeHigh",
      "currency",
      "profilePicture",
      "locations",
      "tags",
      "entityType",
      "firmName",
    ];

    const toSet = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        toSet[key] = req.body[key];
      }
    }

    if (req.body.locations) {
      toSet.country = req.body.locations; // Assign locations to country
    }
    if(req.body.professionalExperiences){
      console.log("professionalExperiences",req.body.professionalExperiences);
      toSet.professionalExperiences = req.body.professionalExperiences;
    }

    // Ensure profilePicture is set from uploaded pic when not provided explicitly
    if (profilePicUrl && !toSet.profilePicture) {
      toSet.profilePicture = profilePicUrl;
    }

    if (Object.keys(toSet).length) {
      if (updatedUser.professional) {
        updatedProfessional = await Professional.findByIdAndUpdate(
          updatedUser.professional,
          { $set: toSet },
          { new: true, runValidators: true }
        );
      } else {
        updatedProfessional = await Professional.create({
          user: updatedUser._id,
          ...toSet,
        });
        updatedUser.professional = updatedProfessional._id;
        await updatedUser.save();
      }
    } else if (updatedUser.professional) {
      updatedProfessional = await Professional.findById(updatedUser.professional);
    }
  }

  const payload = { user: updatedUser };
  if (updatedProfessional) payload.professional = updatedProfessional;

  res
    .status(200)
    .json(new Apiresponse(200, payload, "Profile updated successfully"));
});


const toggleActiveRole = asynchandler(async (req, res) => {
  const { activeRole } = req.body;
  const user = await Users.findById(req.user._id);
  if (!user) throw new Apierror(404, "User not found");

  if (!activeRole) {
    user.activeRole = null;
    await user.save();
    const sanitized = await Users.findById(user._id).select(
      "-password -refreshToken"
    );
    return res
      .status(200)
      .json(new Apiresponse(200, sanitized, "Active role cleared"));
  }

  const allowed = ["asker", "professional"];
  if (!allowed.includes(activeRole))
    throw new Apierror(400, "Invalid active role");

  if (activeRole === "admin") {
    if (!user.isAdmin)
      throw new Apierror(403, "Only admins can switch to admin active role");
    await user.switchToAdmin();
  } else if (activeRole === "professional") {
    await user.switchToProfessional();
  } else if (activeRole === "asker") {
    await user.switchToAsker();
  }

  const updated = await Users.findById(user._id).select(
    "-password -refreshToken"
  );
  return res
    .status(200)
    .json(new Apiresponse(200, updated, "Active role updated"));
});

const uploadFile = asynchandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new Apierror(400, "No file uploaded");
  }

  const uploadedFile = await uploadOnS3(file);
  if (!uploadedFile) {
    throw new Apierror(500, "File upload failed");
  }

  const publicUrl = `https://${uploadedFile.bucket}.s3.amazonaws.com/${uploadedFile.key}`;

  res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { url: publicUrl, key: uploadedFile.key, bucket: uploadedFile.bucket },
        "File uploaded successfully"
      )
    );
});

export const deleteProfessionalAccount = asynchandler(async (req, res) => {
  const user = await Users.findById(req.user._id).populate("professional");
  if (!user) throw new Apierror(404, "User not found");

  if (!user.professional) {
    throw new Apierror(400, "User is not a professional");
  }

  // Delete associated professional data
  await Professional.findByIdAndDelete(user.professional._id);

  // Remove professional reference from user
  user.professional = null;
  user.roles = user.roles.filter((role) => role !== "professional");
  if (user.activeRole === "professional") {
    user.activeRole = null;
  }

  await user.save();

  return res
    .status(200)
    .json(new Apiresponse(200, null, "Professional account deleted successfully"));
});


export const deleteAskerAccount = asynchandler(async (req, res) => {
  const user = await Users.findById(req.user._id).populate("asker");
  if (!user) throw new Apierror(404, "User not found");

  if (!user.asker) {
    throw new Apierror(400, "User is not an asker");
  }

  // Delete associated asker data
  await Asker.findByIdAndDelete(user.asker._id);

  // Remove asker reference from user
  user.asker = null;
  user.roles = user.roles.filter((role) => role !== "asker");
  if (user.activeRole === "asker") {
    user.activeRole = null;
  }

  await user.save();

  return res
    .status(200)
    .json(new Apiresponse(200, null, "Asker account deleted successfully"));
});

export {
  updateInfo,
  registerStep4,
  registerStep5,
  Loginuser,
  uploadFile,
  LogoutUser,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  registerStep1,
  registerStep2,
  registerStep3,
  toggleActiveRole,
  getRegistrationState,
  linkedinCallback,
  getLinkedInProfile,
};
