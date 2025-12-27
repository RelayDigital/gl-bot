# Instagram AI account warmup

## Request URL
- https://openapi.geelark.com/open/v1/rpa/task/instagramWarmup

## Request Method
- POST

## Request Parameters

| Parameter     | Required | Type   | Description                          |
|---------------|----------|--------|--------------------------------------|
| name          | No       | string | Task name, up to 128 characters      |
| remark        | No       | string | Remarks, up to 200 characters        |
| scheduleAt    | Yes      | int    | Scheduled time (timestamp)           |
| id            | Yes      | string | Cloud phone ID                       |
| browseVideo   | No       | int    | Number of videos viewed, 1-100       |
| keyword       | No       | string | Search keyword                       |