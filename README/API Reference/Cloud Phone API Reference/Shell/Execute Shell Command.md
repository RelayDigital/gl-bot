# Execute shell command

## Interface Description
Execute shell commands on cloud phones.

**Supported models only:**
- Android 10
- Android 12
- Android 13
- Android 14
- Android 15

---

## Request URL
- https://openapi.geelark.com/open/v1/shell/execute

## Request Method
- POST

---

## Request Parameters

| Parameter Name | Required | Type   | Description        | Example               |
|----------------|----------|--------|--------------------|-----------------------|
| id             | Yes      | string | Cloud phone ID     | Refer to request example |
| cmd            | Yes      | string | Command to execute | Refer to request example |

---

## Response Data Description

| Parameter Name | Type   | Description                                      |
|----------------|--------|--------------------------------------------------|
| status         | bool   | true: execution successful, false: execution failed |
| output         | string | Execution result                                 |

---

## Error Codes

Below are the specific error codes for this interface.  
For other error codes, refer to the **API Call Instructions**.

| Error Code | Description                                      |
|------------|--------------------------------------------------|
| 42001      | Cloud phone does not exist                       |
| 42002      | Cloud phone is not in running state              |
| 50001      | Cloud phone does not support shell commands      |