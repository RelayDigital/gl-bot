# Query task

## API Description
Task Query

## Request URL
- https://openapi.geelark.com/open/v1/task/query

## Request Method
- POST

## Request Parameters

### Query Parameters (ignore if empty)

| Parameter Name | Required | Type          | Description                  | Example             |
|----------------|----------|---------------|------------------------------|---------------------|
| ids            | Yes      | array[string] | Array of task IDs, up to 100 | See request example |

---

## Response Data Description

| Parameter Name | Type        | Description            |
|----------------|-------------|------------------------|
| total          | integer     | Total number of tasks  |
| items          | array[Task] | Array of tasks         |

---

## Task Object

| Parameter Name | Type    | Description                                                                 |
|----------------|---------|-----------------------------------------------------------------------------|
| id             | string  | Task ID                                                                     |
| planName       | string  | Task plan name                                                              |
| taskType       | integer | Task type:                                                                  |
|                |         | 1 = TikTok video posting                                                    |
|                |         | 2 = TikTok AI account warmup                                                |
|                |         | 3 = TikTok carousel posting                                                 |
|                |         | 4 = TikTok account login                                                    |
|                |         | 6 = TikTok profile editing                                                  |
|                |         | 42 = Custom (including Facebook, YouTube, and other platforms)             |
| serialName     | string  | Cloud phone name                                                            |
| envId          | string  | Cloud phone ID                                                              |
| scheduleAt     | integer | Scheduled time (timestamp in seconds)                                       |
| status         | integer | Task status:                                                                |
|                |         | 1 = Waiting                                                                 |
|                |         | 2 = In progress                                                             |
|                |         | 3 = Completed                                                               |
|                |         | 4 = Failed                                                                  |
|                |         | 7 = Cancelled                                                               |
| failCode       | integer | Failure code (refer to task failure codes and reasons)                      |
| failDesc       | string  | Failure reason (refer to task failure codes and reasons)                    |
| cost           | integer | Time taken for the task to complete or fail (in seconds)                   |
| shareLink      | string  | Share link                                                                  |