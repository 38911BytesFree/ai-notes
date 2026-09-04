# Cloud Build Triggers

To import the build-and-deploy triggers for `ai-notes-api` and `ai-notes-web`, replace `<GITHUB_OWNER>` in `cloudbuild/triggers/api.trigger.yaml` and `cloudbuild/triggers/web.trigger.yaml` with your GitHub username or organization (e.g. `38911BytesFree`), ensure your GitHub repository is connected under Cloud Build in the Google Cloud Console, and run:

```bash
gcloud builds triggers import --project=ai-notes-507510 --region=europe-west1 --source=cloudbuild/triggers/api.trigger.yaml
gcloud builds triggers import --project=ai-notes-507510 --region=europe-west1 --source=cloudbuild/triggers/web.trigger.yaml
```
