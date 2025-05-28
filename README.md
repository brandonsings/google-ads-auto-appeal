Google Ads Script: Auto-Appeal Disapproved or Limited Ads
Author: Brandon Whalen
 
DESCRIPTION:
This script scans all ENABLED ads in ENABLED campaigns across SEARCH, DISPLAY, VIDEO,
MULTI_CHANNEL, and PERFORMANCE_MAX types. It checks for disapproved or limited ads and attempts
to automatically submit an appeal for those that are eligible.

It ensures each appeal is submitted only once per ad-policy-topic combination to prevent over-submission.
The script logs all actions taken, including skipped ads, appeals submitted, and failures.
A detailed summary is emailed to the configured address when appeals are made.

USAGE INSTRUCTIONS:
1. Log into your Google Ads account and go to Tools > Scripts.
2. Create a new script and paste the full code from this file.
3. Authorize the script to access your account when prompted.
4. Set a schedule to run this script periodically (e.g. daily or weekly).
5. Ensure the NOTIFICATION_EMAIL is set to your email address for summary reports.
6. To reset appeal tracking, clear the script properties (Apps Script > Properties > Script Properties).

NOTE:
- This script respects Google Ads' limits and best practices to avoid over-submission.
- Appeals are only attempted once per ad/topic combination.
- Ads without policy topics or already under review are skipped with a clear reason.
- Manual review is flagged for Performance Max and Multi-Channel ads.

VARIABLES:
- NOTIFICATION_EMAIL: the email address that receives the report summary when any appeals are made.
- APPEAL_JUSTIFICATION: reason for appeal, e.g., DISPUTE_POLICY_DECISION.
