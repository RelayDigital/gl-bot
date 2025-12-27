# Task flow query

## Request URL
- https://openapi.geelark.com/open/v1/task/flow/list

## Request Method
- POST

---

## Request Parameters

| Parameter | Required | Type    | Description                                      |
|-----------|----------|---------|--------------------------------------------------|
| page      | Yes      | integer | Page number, minimum value is 1                  |
| pageSize  | Yes      | integer | Number of items per page, min 1, max 100         |

---

## Response Data Description

| Field Name | Type              | Description                 |
|------------|-------------------|-----------------------------|
| total      | integer           | Total number of items       |
| page       | integer           | Page number                 |
| pageSize   | integer           | Number of items per page    |
| items      | array[TaskFlow]   | Task flow array             |

---

## TaskFlow Object

| Field Name | Type           | Description                         |
|------------|----------------|-------------------------------------|
| id         | string         | Task flow ID                        |
| title      | string         | Task flow title                     |
| desc       | string         | Task flow description               |
| params     | array[string]  | Task flow parameter field names     |