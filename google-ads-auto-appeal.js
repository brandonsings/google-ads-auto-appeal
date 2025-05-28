/**
 * Google Ads Script: Auto-Appeal Disapproved or Limited Ads
 * Author: Brandon Whalen
 * 
 * DESCRIPTION:
 * This script scans all ENABLED ads in ENABLED campaigns across SEARCH, DISPLAY, VIDEO,
 * MULTI_CHANNEL, and PERFORMANCE_MAX types. It checks for disapproved or limited ads and attempts
 * to automatically submit an appeal for those that are eligible.
 * 
 * It ensures each appeal is submitted only once per ad-policy-topic combination to prevent over-submission.
 * The script logs all actions taken, including skipped ads, appeals submitted, and failures.
 * A detailed summary is emailed to the configured address when appeals are made.
 * 
 * USAGE INSTRUCTIONS:
 * 1. Log into your Google Ads account and go to Tools > Scripts.
 * 2. Create a new script and paste the full code from this file.
 * 3. Authorize the script to access your account when prompted.
 * 4. Set a schedule to run this script periodically (e.g. daily or weekly).
 * 5. Ensure the NOTIFICATION_EMAIL is set to your email address for summary reports.
 * 6. To reset appeal tracking, clear the script properties (Apps Script > Properties > Script Properties).
 * 
 * NOTE:
 * - This script respects Google Ads' limits and best practices to avoid over-submission.
 * - Appeals are only attempted once per ad/topic combination.
 * - Ads without policy topics or already under review are skipped with a clear reason.
 * - Manual review is flagged for Performance Max and Multi-Channel ads.
 * 
 * VARIABLES:
 * - NOTIFICATION_EMAIL: the email address that receives the report summary when any appeals are made.
 * - APPEAL_JUSTIFICATION: reason for appeal, e.g., DISPUTE_POLICY_DECISION.
 */

const NOTIFICATION_EMAIL = 'your@email.com';
const APPEAL_JUSTIFICATION = 'DISPUTE_POLICY_DECISION';

// The main function that orchestrates the process
function main() {
  const props = PropertiesService.getScriptProperties();

  // Counters and logs for reporting
  let adsChecked = 0;
  let topicsChecked = 0;
  let appealableCount = 0;
  let underReviewCount = 0;
  let nonAppealableCount = 0;
  let manualReview = [];
  let adTypeCounts = {};
  let totalScannableAds = 0;

  let appealableList = [];
  let underReviewList = [];
  let nonAppealableList = [];
  let adReviewLog = [];
  let skippedAdsLog = [];

  // Google Ads Query Language (GAQL) to retrieve ads with their policy summaries
  const query = `
    SELECT
      campaign.name,
      ad_group.name,
      ad_group.id,
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      campaign.advertising_channel_type,
      ad_group_ad.policy_summary.approval_status,
      ad_group_ad.policy_summary.policy_topic_entries
    FROM ad_group_ad
    WHERE
      campaign.advertising_channel_type IN ('SEARCH', 'DISPLAY', 'VIDEO', 'MULTI_CHANNEL', 'PERFORMANCE_MAX')
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_ad.status = 'ENABLED'
  `;

  const ads = AdsApp.search(query);

  while (ads.hasNext()) {
    const row = ads.next();
    totalScannableAds++;

    const adId = row.adGroupAd.ad.id;
    const adType = row.adGroupAd.ad.type;
    const channel = row.campaign.advertisingChannelType;
    const policySummary = row.adGroupAd.policySummary;
    const policyTopics = policySummary && policySummary.policyTopicEntries ? policySummary.policyTopicEntries : [];
    const campaign = row.campaign.name;
    const adGroup = row.adGroup.name;
    const adGroupId = row.adGroup.id;
    const url = 'https://ads.google.com/aw/ads?adId=' + adId;

    // Track ad type frequency
    adTypeCounts[adType] = (adTypeCounts[adType] || 0) + 1;

    // Skip if no policy topics
    if (!policyTopics || policyTopics.length === 0) {
      skippedAdsLog.push(`⚠️ Skipped (No policy topics): Ad ${adId} [${adType}] – ${campaign} > ${adGroup}`);
      continue;
    }

    let adProcessed = false;
    adsChecked++;

    // Process each policy topic for the ad
    for (let i = 0; i < policyTopics.length; i++) {
      topicsChecked++;
      const topic = policyTopics[i].topic;
      const appealable = policyTopics[i].appealable;
      const underReview = policyTopics[i].underReview;
      const appealKey = 'appealed_' + adId + '_' + topic;
      const alreadyAppealed = props.getProperty(appealKey);

      const label = `Ad ${adId} [${adType}] (${channel}) – Topic: "${topic}"\nCampaign: ${campaign} > ${adGroup}\nLink: ${url}`;

      // If eligible and not already appealed or under review, submit an appeal
      if (appealable && !underReview && !alreadyAppealed && ['SEARCH', 'DISPLAY', 'VIDEO'].includes(channel)) {
        try {
          const adIter = AdsApp.adGroups().withIds([adGroupId]).get().next().ads().withIds([[adGroupId, adId]]).get();
          if (adIter.hasNext()) {
            const ad = adIter.next();
            ad.appealPolicy(APPEAL_JUSTIFICATION, [topic]);
            props.setProperty(appealKey, new Date().toISOString());
            appealableList.push(`✅ Appealed Automatically:\n${label}`);
            adReviewLog.push(`✅ Appealed: Ad ${adId} – Topic: ${topic}`);
            appealableCount++;
            adProcessed = true;
          } else {
            nonAppealableList.push(`❌ Could not locate ad for appeal:\n${label}`);
            adReviewLog.push(`❌ Failed to locate ad for appeal: ${adId}`);
            nonAppealableCount++;
          }
        } catch (err) {
          nonAppealableList.push(`❌ Error during auto-appeal:\n${label}\nError: ${err.message}`);
          adReviewLog.push(`❌ Error during appeal: Ad ${adId} – ${err.message}`);
          nonAppealableCount++;
        }
      } else if (underReview) {
        underReviewCount++;
        underReviewList.push(label);
        adReviewLog.push(`🔄 Skipped (Under review): Ad ${adId} – Topic: ${topic}`);
        adProcessed = true;
      } else if (appealable && alreadyAppealed) {
        underReviewCount++;
        underReviewList.push(`🔁 Already Appealed (script-tracked):\n${label}`);
        adReviewLog.push(`🔁 Skipped (Already appealed): Ad ${adId} – Topic: ${topic}`);
        adProcessed = true;
      } else {
        nonAppealableCount++;
        nonAppealableList.push(label);
        adReviewLog.push(`🚫 Skipped (Not appealable): Ad ${adId} – Topic: ${topic}`);
        adProcessed = true;
      }

      // Manual review required for PMax and Multi-Channel
      if (['MULTI_CHANNEL', 'PERFORMANCE_MAX'].includes(channel)) {
        manualReview.push(label);
        adReviewLog.push(`🛑 Manual review required (PMax/Multi-Channel): Ad ${adId} – Topic: ${topic}`);
        adProcessed = true;
      }
    }

    if (!adProcessed) {
      adReviewLog.push(`⚠️ Skipped (No action taken): Ad ${adId} [${adType}] – ${campaign} > ${adGroup}`);
    }
  }

  // Build and send the report
  let summary = '📊 Google Ads Appeal Script Report – ' + new Date().toLocaleString() +
    '\n===========================================================' +
    '\n\n📌 Summary:' +
    `\n🧮 Total Scannable Ads in Account: ${totalScannableAds}` +
    `\n🔍 Ads Checked for Policy Issues: ${adsChecked}` +
    `\n📄 Total Policy Topics Reviewed: ${topicsChecked}` +
    `\n✅ Successful Appeals Submitted: ${appealableCount}` +
    `\n🔄 Already Under Review or Previously Appealed: ${underReviewCount}` +
    `\n🚫 Topics Not Appealable: ${nonAppealableCount}` +

    (appealableList.length ? '\n\n✅ Appeals Submitted:\n' + appealableList.join('\n\n') : '') +
    (underReviewList.length ? '\n\n🔄 Under Review or Previously Appealed:\n' + underReviewList.join('\n\n') : '') +
    (nonAppealableList.length ? '\n\n🚫 Topics Not Appealable:\n' + nonAppealableList.join('\n\n') : '') +
    (manualReview.length ? '\n\n🛑 Manual Review Required (PMax/Multi-Channel):\n' + manualReview.join('\n\n') : '') +
    (skippedAdsLog.length ? '\n\n⚠️ Skipped Ads (No Policy Topics Found):\n' + skippedAdsLog.join('\n') : '') +

    '\n\n🧾 Detailed Ad Review Log:\n' + adReviewLog.join('\n');

  if (Object.keys(adTypeCounts).length > 0) {
    summary += '\n\n📦 Ad Type Distribution:';
    for (const type in adTypeCounts) {
      summary += `\n- ${type}: ${adTypeCounts[type]}`;
    }
  }

  Logger.log(summary);
  if (appealableCount > 0) {
    MailApp.sendEmail(NOTIFICATION_EMAIL, 'Google Ads Appeal Script Report', summary);
  }
}
