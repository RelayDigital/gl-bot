# Query status

## API Description
Retrieve the status of cloud phones.

## Request URL
- https://openapi.geelark.com/open/v1/phone/status

## Request Method
- POST

## Request Parameters

### Query Parameters

| Parameter Name | Required | Type          | Description                                 | Example             |
|----------------|----------|---------------|---------------------------------------------|---------------------|
| ids            | Yes      | array[string] | List of cloud phone IDs, limit to 100 items | See request example |

---

## Response Data Description

| Parameter Name   | Type                  | Description                                   |
|------------------|-----------------------|-----------------------------------------------|
| totalAmount     | integer               | Total number of requested IDs                 |
| successAmount   | integer               | Total number of successful responses          |
| failAmount      | integer               | Total number of failed responses              |
| successDetails  | array[SuccessDetails] | Information about successful responses        |
| failDetails     | array[FailDetails]    | Information about failed responses            |

---

## SuccessDetails Object

| Parameter Name | Type    | Description                                      |
|----------------|---------|--------------------------------------------------|
| id             | string  | ID of the successful cloud phone                 |
| serialName     | string  | Name of the successful cloud phone               |
| status         | integer | Cloud phone status code:                         |
|                |         | 0 = Started                                      |
|                |         | 1 = Starting                                     |
|                |         | 2 = Shut down                                    |
|                |         | 3 = Expired                                      |

---

## FailDetails Object

| Parameter Name | Type   | Description                                      |
|----------------|--------|--------------------------------------------------|
| code           | int    | Failure code (e.g. 42001: Cloud phone not exist) |
| id             | string | ID of the failed cloud phone                     |
| msg            | string | Failure message                                  |