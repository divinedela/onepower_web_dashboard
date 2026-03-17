const moment = require("moment");

// Enrich campaigns with donation totals and time status.
// campaigns: array of Supabase campaign rows (with fields: id, campaign_amount, starting_date, ending_date, image, gallery)
// donations: optional pre-fetched donations array with fields (campaign_id, amount, payment_status)
async function combineCampaignAndDonation(campaigns, donations = []) {
  const list = Array.isArray(campaigns) ? campaigns : [campaigns];

  const updated = list.map((c) => {
    const dons = donations.filter(
      (d) => String(d.campaign_id) === String(c.id) && d.payment_status === "Successful"
    );
    const totalDonationAmount = dons.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const remainingAmount = Math.max(0, Number(c.campaign_amount || 0) - totalDonationAmount);

    const currentDate = moment();
    const endDate = moment(c.ending_date).endOf("day");
    const startDate = moment(c.starting_date);
    const currentStart = moment().startOf("day");

    const daysUntilStart = startDate.diff(currentStart, "days");
    const daysUntilEnd = endDate.diff(currentStart, "days");

    let remainingTime;
    if (daysUntilEnd < 0) remainingTime = "Campaign ended";
    else if (daysUntilStart > 0) remainingTime = `Upcoming in ${daysUntilStart} days`;
    else if (daysUntilEnd === 0) {
      const remainingHours = endDate.diff(currentDate, "hours");
      remainingTime = remainingHours <= 0 ? "Campaign ended" : `${remainingHours} hours left`;
    } else remainingTime = `${daysUntilEnd} days left`;

    let newStatus;
    if (endDate < currentStart) newStatus = "Ended";
    else if (startDate > currentStart) newStatus = "Upcoming";
    else newStatus = "Running";

    let gallery = Array.isArray(c.gallery) ? [...c.gallery] : [];
    if (c.image && !gallery.includes(c.image)) gallery.unshift(c.image);

    return {
      ...c,
      gallery,
      totalDonationAmount,
      remainingAmount,
      totalDonors: dons.length,
      remainingTime,
      campaign_status: newStatus,
    };
  });

  return Array.isArray(campaigns) ? updated : updated[0];
}

module.exports = combineCampaignAndDonation;
