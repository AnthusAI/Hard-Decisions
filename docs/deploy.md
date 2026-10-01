# Deploying hard-decisions.anth.us

The site is a static Astro build (`site/dist`) served by AWS Amplify Hosting, next to
biased-decisions.anth.us, in the `legacy` AWS account (us-east-1). The setup mirrors Biased-Decisions'
manual-deployment app: Amplify has no Git connection and builds nothing; we upload the exact artifact we built
and tested.

- **App:** `Hard-Decisions` (`da7a84vbkxuhu`), branch `main` (production), default URL
  https://main.da7a84vbkxuhu.amplifyapp.com
- **Domain:** `hard-decisions.anth.us`, an Amplify-managed certificate; the DNS records live in the `anth.us`
  Route 53 zone in the same account and were created by Amplify.
- **Rules and headers:** `deploy/amplify-rules.json` (404 page, `/index.html` redirect) and `customHttp.yml`
  (no-cache pages, immutable `/_astro/` and `/og/` files). The AWS CLI rejects the `"condition": null` fields,
  so pass a copy without them when updating the app.

## Deploy

```sh
make deploy          # = tools/deploy_site.sh: clean tree, build, test, upload, wait for the job
```

You need an AWS session for the `legacy` profile (SSO). Rebuild and deploy after `hd replay && hd report`
whenever results change; the site reads `studies/`, `engines.yaml`, the run manifests and the probe at build time.

## Moving accounts

When the site moves out of `legacy`: create the same app in the new account, deploy, smoke-test the default
URL, then move the domain association, as in Biased-Decisions' `docs/deploy.md`.
