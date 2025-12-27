# Request Instructions

## General Request Rules
- All API requests must be initiated using **POST**.
- All request bodies must be in **JSON** format.
  - Set request header `Content-Type` to `application/json`.
- Two verification methods are supported:
  - Key verification
  - Token verification
- API rate limit: **200 requests per minute**, **24,000 requests per hour**.

---

## Token Verification

When making a request, include **only** the following request headers:

- `traceId`: Use **Version 4 UUID**
- `Authorization`:  
  `Bearer <the token value obtained from the client>`

---

## Key Verification

### Required Request Headers for Verification
- `appId`: Team AppId
- `traceId`: Unique request ID
- `ts`: Timestamp in milliseconds
- `nonce`: Random number
- `sign`: Signature result

### Verification Parameter Generation Method
- `traceId`: Use **Version 4 UUID**
- `nonce`: Use the **first 6 characters** of `traceId`
- `sign`:
  - Concatenate the string:  
    `TeamAppId + traceId + ts + nonce + TeamApiKey`
  - Generate the **SHA256 hexadecimal uppercase** digest of the string

---

### Example of Required Request Headers for Verification

Assuming the team’s `ApiKey` is:
```
YjmFIUuQoJgSDJ42fxLEb6R1qjjqf
```
Request headers:

- `appId`: eH6g0R4oHr3FsZpI36Lq01IW
- `traceId`: db6094ab-3797-4186-84d5-b0b58eebad56
- `ts`: 1716972892166
- `nonce`: db6094
- `sign`: 6280C080AF7C3CCE168F15C913E3444A00A618CB0E16038EED9811D6E3366BDD

---

## Response Instructions
- When the response code is **200**, the response body will be in **JSON** format.

---

## Response Object Fields
- `traceId`: Unique request ID
- `code`: Processing result code  
  - `0` = success  
  - Any other value = failure
- `msg`: Processing result description
- `data`: Response data
  - On success: returns response data
  - On failure: returns failure reason
  - On partial success: returns response data and failure reason

---

## Processing Result Code Explanation

- `0`: Success  
- Any other value: Failure  

If an error code appears:
1. Modify the request based on the prompt.
2. If the issue persists, contact customer service and provide `appId`, `traceId`, and the response content.

### Global Error Codes
- `40000`: Unknown error
- `40001`: Failed to read request body
- `40002`: `traceId` in request header cannot be empty
- `40003`: Signature verification failed
- `40004`: Request parameter validation failed
- `40005`: Requested resource does not exist
- `40006`: Partial success (batch APIs only)
- `40007`: Too many requests; rate limit resets next minute
- `40008`: Invalid pagination parameters
- `40009`: Batch processing completely failed
- `40011`: Only for paid users
- `41001`: Balance not enough
- `40012`: API expired; use the new API
- `47002`: Too many concurrent requests; try again later (limit lifted after two hours)