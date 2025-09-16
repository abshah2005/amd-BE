import { Users } from '../models/Users.model.js';
import { Professional } from '../models/Professional.model.js';
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import { accountDeletionService } from '../services/DeletionService.js';

// Request profile deletion
 const requestProfileDeletion = async (req, res) => {
  try {
    const  userId  = req.user._id;  
    const { profileType } = req.body;  
    
    if (!['asker', 'professional'].includes(profileType)) {
      return res.status(400).json({ message: 'Invalid profile type' });
    }
    
    const result = await accountDeletionService.scheduleProfileDeletion(userId, profileType);
    
    return res.status(200).json({
      message: `Your ${profileType} profile will be permanently deleted on ${result.scheduledDeletionDate.toDateString()}`,
      scheduledDate: result.scheduledDeletionDate
    });
  } catch (error) {
    console.error('Error scheduling profile deletion:', error);
    return res.status(500).json({ message: 'Failed to process deletion request' });
  }
};

// Cancel pending deletion
 const cancelProfileDeletion = async (req, res) => {
  try {
    const  userId  = req.user._id;
    const { profileType } = req.body;
    
    if (profileType === 'asker') {
      await Users.findByIdAndUpdate(userId, { 
        isAskerDeleted: false,
        deletionScheduledAt: null
      });
    } else if (profileType === 'professional') {
      await Users.findByIdAndUpdate(userId, { 
        isProDeleted: false,
        deletionScheduledAt: null
      });
      
      await Professional.findOneAndUpdate(
        { user: userId },
        { status: 'active' }
      );
    }
    
    return res.status(200).json({
      message: `Your ${profileType} profile deletion has been cancelled.`
    });
  } catch (error) {
    console.error('Error cancelling profile deletion:', error);
    return res.status(500).json({ message: 'Failed to cancel deletion request' });
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
  
  return res.status(200).json(
    new Apiresponse(
      200, 
      { canCreateProfessional: canCreate }, 
      canCreate ? "You can create a professional account" : "You cannot create a professional account at this time"
    )
  );
});

// Export the function with other exports
export { 
  // ...other exports
  requestProfileDeletion,
  cancelProfileDeletion,
  canCreateProfessionalAccount
};