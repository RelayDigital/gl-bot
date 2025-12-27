# Get screen shot result

## API Description
Query the status of a cloud phone screenshot task.

After requesting a screenshot, you can retrieve the result through this interface within **30 minutes**.  
If it expires, the retrieval will fail.

---

## Request URL
- https://openapi.geelark.com/open/v1/phone/screenShot/result

## Request Method
- POST

---

## Request Parameters

| Parameter Name | Required | Type   | Description | Example                  |
|----------------|----------|--------|-------------|--------------------------|
| taskId         | Yes      | string | Task ID     | Refer to request example |

---

## Response Data Description

| Parameter Name | Type | Description                                                                 |
|----------------|------|-----------------------------------------------------------------------------|
| status         | int  | 0 = Acquisition failed<br>1 = In progress<br>2 = Execution succeeded<br>3 = Execution failed |
| downloadLink  | string | Screenshot download link                                                   |