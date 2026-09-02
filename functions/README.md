# Firestore usage service

The Data Center UI calls `getFirestoreUsage` to read the daily Firestore document-read metric from Google Cloud Monitoring. It returns real metrics; the browser does not estimate usage when this service is unavailable.

Deployment prerequisites:

1. Enable the Cloud Monitoring API for the VIDA Firebase project.
2. Ensure the Functions runtime service account has `roles/monitoring.viewer`.
3. Install dependencies in this directory.
4. Deploy with `firebase deploy --only functions:getFirestoreUsage`.

The default read quota is 50,000 per day. Set `FIRESTORE_DAILY_READ_QUOTA` on the function if the project should use a different comparison limit.
