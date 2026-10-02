#!/usr/bin/env bash
# Deploy site/dist to the Hard-Decisions Amplify app (manual deployments, no Git connection).
# Builds and tests the site first, refuses a dirty tree, then uploads the exact artifact and waits for the job.
# Usage: tools/deploy_site.sh            (AWS profile "legacy", region us-east-1; override with AWS_PROFILE / AWS_REGION)
set -euo pipefail
cd "$(dirname "$0")/.."
APP_ID="da7a84vbkxuhu"            # Amplify app "Hard-Decisions", serves https://hard-decisions.anth.us
BRANCH="main"
PROFILE="${AWS_PROFILE:-legacy}"
REGION="${AWS_REGION:-us-east-1}"

if [ -n "$(git status --porcelain)" ]; then echo "refusing: commit or stash changes first, so the deploy matches a commit" >&2; exit 1; fi
(cd site && npm run build && npm test)
ZIP="$(mktemp -t hard-decisions-site).zip"
(cd site/dist && zip -qr "$ZIP" .)
read -r JOB URL < <(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" \
  --profile "$PROFILE" --region "$REGION" --query '[jobId,zipUploadUrl]' --output text)
curl -sf -X PUT -H "Content-Type: application/zip" --data-binary @"$ZIP" "$URL" >/dev/null
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB" \
  --profile "$PROFILE" --region "$REGION" >/dev/null
for _ in $(seq 1 60); do
  STATUS=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB" \
    --profile "$PROFILE" --region "$REGION" --query 'job.summary.status' --output text)
  case "$STATUS" in SUCCEED) echo "deployed $(git rev-parse --short HEAD) as Amplify job $JOB"; rm -f "$ZIP"; exit 0;;
                    FAILED|CANCELLED) echo "Amplify job $JOB $STATUS" >&2; exit 1;; esac
  sleep 5
done
echo "timed out waiting for Amplify job $JOB" >&2; exit 1
