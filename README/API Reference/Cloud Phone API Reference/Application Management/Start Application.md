# Start application

## API Description
Start an app.

## Request URL
- https://openapi.geelark.com/open/v1/app/start

## Request Method
- POST

## Request Parameters

| Parameter Name | Required | Type   | Description                                                                 | Example                  |
|----------------|----------|--------|-----------------------------------------------------------------------------|--------------------------|
| envId          | Yes      | string | Cloud phone environment ID                                                  | 1809135651036667904      |
| appVersionId  | No       | string | App version ID (either `appVersionId` or `packageName` must be provided)   | 1793552962140770305      |
| packageName   | No       | string | Application package name (either `appVersionId` or `packageName` required) | com.zhiliaoapp.musically |

---

## Error Codes

The following are specific error codes for this interface.  
For other error codes, refer to the **API Call Documentation**.

| Error Code | Description                                         |
|------------|-----------------------------------------------------|
| 42001      | The specified cloud phone does not exist            |
| 42002      | The cloud phone is not in a running state           |
| 42005      | The corresponding app is not installed              |