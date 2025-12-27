# Modify Cloud Phone Information

## Interface Description

**Warning:** Do not operate this API while calling the API to start the cloud phone.

Supported modifications:
- Cloud phone name
- Cloud phone remark
- Cloud phone tags
- Cloud phone proxy configuration
- Cloud phone group
- Cloud phone charge mode

---

## Request URL
- https://openapi.geelark.com/open/v1/phone/detail/update

## Request Method
- POST

---

## Request Parameters

| Parameter Name | Required | Type            | Description                                   |
|----------------|----------|-----------------|-----------------------------------------------|
| id             | Yes      | string          | Cloud phone ID                                |
| name           | No       | string          | New cloud phone name, up to 100 characters    |
| remark         | No       | string          | New cloud phone remark, up to 1500 characters |
| groupId        | No       | string          | New cloud phone group ID                      |
| tagIds         | No       | array[string]   | New cloud phone tag IDs                       |
| proxyConfig    | No       | Proxy           | New cloud phone proxy config                  |
| proxyId        | No       | string          | Proxy ID                                     |

---

## proxyConfig – Static Proxy Parameters

| Parameter Name | Required | Type    | Description               | Example     |
|----------------|----------|---------|---------------------------|-------------|
| typeId         | Yes      | integer | Proxy type ID             | 1           |
| server         | Yes      | string  | Proxy server hostname     | server.com  |
| port           | Yes      | integer | Proxy server port         | 1234        |
| username       | Yes      | string  | Proxy server username     | user        |
| password       | Yes      | string  | Proxy server password     | password    |

---

## proxyConfig – Dynamic Proxy Parameters

Dynamic proxy settings can be configured on the client side first.  
By setting `useProxyCfg` to `true`, you can reuse the configured proxy without re-providing host, port, and credentials.

| Parameter Name | Required | Type    | Description                                       | Example   |
|----------------|----------|---------|---------------------------------------------------|-----------|
| useProxyCfg    | Yes      | bool    | Whether to use the already configured proxy       | true      |
| typeId         | Yes      | integer | Proxy type ID                                     | 20        |
| protocol       | No       | integer | Proxy protocol: 1 = SOCKS5, 2 = HTTP              | 1         |
| server         | No       | string  | Proxy server hostname                             | server.com|
| port           | No       | integer | Proxy server port                                 | 1234      |
| username       | No       | string  | Proxy server username                             | user      |
| password       | No       | string  | Proxy server password                             | password  |
| country        | No       | string  | Country                                           | us        |
| region         | No       | string  | Region                                            | alabama   |
| city           | No       | string  | City                                              | mobile    |

---

## Proxy Type ID List

### Static Proxy Types
- `1` — SOCKS5
- `2` — HTTP
- `3` — HTTPS

### Dynamic Proxy Types
- `20` — IPIDEA
- `21` — IPHTML
- `22` — kookeey
- `23` — Lumat uo

---

## Response Data Description

| Parameter Name | Type               | Description                     |
|----------------|--------------------|---------------------------------|
| failDetails    | array[FailDetails] | Tag addition failure information|

---

## FailDetails Object

| Parameter Name | Type    | Description   |
|----------------|---------|---------------|
| code           | integer | Error code    |
| id             | integer | Tag ID        |
| msg            | string  | Error message |

---

## Error Codes

For other error codes, refer to the **API Call Instructions**.

| Error Code | Description                        |
|------------|------------------------------------|
| 42001      | Cloud phone does not exist          |
| 43022      | Tag does not exist                  |
| 43032      | Group does not exist                |
| 45003      | Proxy region not allowed            |
| 45004      | Proxy check failed, check config   |
| 45008      | Proxy type not allowed              |