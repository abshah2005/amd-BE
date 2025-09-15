import cron from 'node-cron';
import { accountDeletionService } from '../services/DeletionService.js';

// Run daily at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running scheduled account deletion job');
  try {
    const result = await accountDeletionService.processScheduledDeletions();
    console.log(`Processed ${result.processed} account deletions`);
  } catch (error) {
    console.error('Error processing scheduled deletions:', error);
  }
});