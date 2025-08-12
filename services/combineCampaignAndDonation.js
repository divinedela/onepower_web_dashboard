// Import moment
const moment = require("moment");
const util = require("util");

// Import donation and campaign models
const campaignModel = require("../model/campaignModel");
const donationModel = require("../model/donationModel");

const combineCampaignAndDonation = async (campaign) => {
    // Ensure campaign is an array for consistent processing
    const campaigns = util.isArray(campaign) ? campaign : [campaign];

    const updatedCampaigns = await Promise.all(campaigns.map(async (campaign) => {

        // Retrieve donations for the campaign
        const donations = await donationModel.find({ campaignId: campaign._id });

        // Calculate total donation and remaining amount
        const totalDonationAmount = donations.reduce((sum, { amount = 0 }) => sum + amount, 0);
        const remainingAmount = Math.max(0, campaign.campaign_amount - totalDonationAmount);

        // Calculate campaign status and remaining time
        const currentDate = moment();
        const endDate = moment(campaign.ending_date).endOf('day');
        const startDate = moment(campaign.starting_date);
        const currentDateStartOfDay = moment().startOf('day');

        const daysUntilStart = startDate.diff(currentDateStartOfDay, 'days');
        const daysUntilEnd = endDate.diff(currentDateStartOfDay, 'days');

        let remainingTime;

        if (daysUntilEnd < 0) { // Check if the campaign has already ended
            remainingTime = 'Campaign ended';
        } else if (daysUntilStart > 0) { // Campaign is upcoming
            remainingTime = `Upcoming in ${daysUntilStart} days`;
        } else if (daysUntilEnd === 0) { // Campaign is ending today
            const remainingHours = endDate.diff(currentDate, 'hours');
            remainingTime = remainingHours <= 0 ? 'Campaign ended' : `${remainingHours} hours left`;
        } else { // Campaign is ongoing
            remainingTime = `${daysUntilEnd} days left`;
        }

        // Determine new campaign status
        let newStatus;
        if (endDate < currentDateStartOfDay) newStatus = "Ended";
        else if (startDate > currentDateStartOfDay) newStatus = "Upcoming";
        else newStatus = "Running";

        // Update the status in the database if it changed
        if (campaign.campaign_status !== newStatus) {
            const updatedCampaign = await campaignModel.findByIdAndUpdate(
                campaign._id,
                { $set: { campaign_status: newStatus } },
                { new: true }
            ).populate("categoryId", "_id image name").select("-userId -isUser -status -isApproved")
            campaign = updatedCampaign;
        }

        // Include the feature image in the gallery if it exists
        let gallery = campaign.gallery || []
        if (campaign.image && !gallery.includes(campaign.image)) {
            gallery.unshift(campaign.image);
        }

        // Return enriched campaign data
        return {
            ...campaign.toObject(),
            totalDonationAmount,
            remainingAmount,
            totalDonors: donations.length,
            remainingTime,
        };
    }));

    return util.isArray(campaign) ? updatedCampaigns : updatedCampaigns[0];
};

module.exports = combineCampaignAndDonation;
