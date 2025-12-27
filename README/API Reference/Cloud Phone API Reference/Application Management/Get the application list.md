# Get the application list

## API Description
Get the application list

## Request URL
- https://openapi.geelark.com/open/v1/app/shop/list

## Request Method
- POST

## Request Parameters

| Parameter Name | Required | Type    | Description                                              | Example |
|---------------|----------|---------|----------------------------------------------------------|---------|
| key           | No       | string  | Search keyword                                           | tiktok  |
| getUploadApp  | No       | bool    | Get uploaded apps                                        | true    |
| page          | Yes      | integer | Page number, minimum is 1                                | 1       |
| pageSize      | Yes      | integer | Number of data items per page, minimum is 1, maximum 200 | 10      |