# Screen Shot

## API Description
Get a screen shot from a cloud phone.

---

## Request URL
- https://openapi.geelark.com/open/v1/phone/screenShot

## Request Method
- POST

---

## Request Parameters

| Parameter Name | Required | Type   | Description       | Example                  |
|----------------|----------|--------|-------------------|--------------------------|
| id             | Yes      | string | Cloud phone ID    | Refer to request example |

---

## Response Data Description

| Parameter Name | Type   | Description |
|----------------|--------|-------------|
| taskId         | string | Task ID     |

---

## Error Codes

The following are specific error codes for this API.  
For other error codes, refer to the **API Call Description**.

| Error Code | Description                   |
|------------|-------------------------------|
| 42001      | Cloud phone does not exist    |
| 42002      | Cloud phone is not running    |