# Stop cloud phone

## API Description
Batch shut down cloud phones.

Cloud phones can be shut down only when they are in the following state:
- **Idle**: Can be shut down
- **Remotely Connected**: Cannot be shut down
- **Executing Task**: Cannot be shut down

## Request URL
- https://openapi.geelark.com/open/v1/phone/stop

## Request Method
- POST

## Request Parameters

| Parameter Name | Required | Type          | Description                     | Example              |
|----------------|----------|---------------|---------------------------------|----------------------|
| ids            | Yes      | array[string] | List of cloud phone IDs         | See request example  |