# Create custom task

## API Description
Get the task flows by **Task flow query** first

## Request URL
- https://openapi.geelark.com/open/v1/task/rpa/add

## Request Method
- POST

## Request Parameters

| Parameter   | Required | Type   | Description                                                                 |
|-------------|----------|--------|-----------------------------------------------------------------------------|
| name        | No       | string | Task name, up to 32 characters                                              |
| remark      | No       | string | Remarks, up to 200 characters                                               |
| scheduleAt  | Yes      | int    | Scheduled time (timestamp)                                                  |
| id          | Yes      | string | Cloud phone ID                                                              |
| flowId      | Yes      | string | Task flow ID (the `id` field of the Task flow query response)               |
| paramMap    | No       | object | Task flow parameters; file-type parameters should be an array               |