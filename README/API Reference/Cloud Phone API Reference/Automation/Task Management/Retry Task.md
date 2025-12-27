# Retry Task

## API Description
A task can be retried up to **5 times**.

- Tasks created by the **client UI** will automatically retry up to **2 times** if they fail.
- Tasks created via the **API** will **not** automatically retry.
- If the task still fails after automatic retries, this interface can be used to retry the task manually.

This interface can be called only when the task is in one of the following states:
- **Task Failed**
- **Task Canceled**

---

## Request URL
- https://openapi.geelark.com/open/v1/task/restart

## Request Method
- POST

---

## Request Parameters

| Parameter Name | Required | Type          | Description          |
|----------------|----------|---------------|----------------------|
| ids            | Yes      | array[string] | Array of task IDs    |

---

## Response Data Description

| Parameter Name | Type               | Description                               |
|----------------|--------------------|-------------------------------------------|
| totalAmount    | integer            | Total number of tasks processed           |
| successAmount  | integer            | Number of tasks processed successfully   |
| failAmount     | integer            | Number of tasks that failed to process   |
| failDetails    | array[FailDetail]  | Details of failed tasks                  |

---

## FailDetail Object

| Parameter Name | Type    | Description     |
|----------------|---------|-----------------|
| id             | string  | Task ID         |
| code           | integer | Error code      |
| msg            | string  | Error message   |

---

## Error Codes

For outer response error codes, refer to the **API Call Documentation**.

### Single Task Processing Error Codes

| Error Code | Description                              |
|------------|------------------------------------------|
| 40005      | Environment has been deleted             |
| 48000      | Task retry limit reached                 |
| 48001      | Task status does not allow retry         |
| 48002      | Task does not exist                      |
| 48003      | Task resource has expired                |