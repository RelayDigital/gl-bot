# Instagram auto login

## Request URL
- https://openapi.geelark.com/open/v1/rpa/task/instagramLogin

## Request Method
- POST

## Request Parameters

| Parameter   | Required | Type   | Description                          |
|-------------|----------|--------|--------------------------------------|
| name        | No       | string | Task name, up to 128 characters      |
| remark      | No       | string | Remarks, up to 200 characters        |
| scheduleAt  | Yes      | int    | Scheduled time (timestamp)           |
| id          | Yes      | string | Cloud phone ID                       |
| account     | Yes      | string | Account, up to 64 characters         |
| password    | Yes      | string | Password, up to 64 characters        |