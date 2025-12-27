# Start cloud phone

## API Description
Batch start cloud phones.

## Request URL
- https://openapi.geelark.com/open/v1/phone/start

## Request Method
- POST

## Request Parameters

| Parameter Name | Required | Type          | Description                                                     | Example                                              |
|----------------|----------|---------------|-----------------------------------------------------------------|------------------------------------------------------|
| ids            | Yes      | array[string] | List of cloud phone IDs                                         | See request example                                  |
| hideSideBar    | No       | bool          | Whether to hide the sidebar                                     | false (default if not provided)                      |
| displayTimer   | No       | bool          | Whether to display the timer                                    | false (default if not provided)                      |
| width          | No       | int           | Cloud phone display width in px                                 | Default: 336 (200 ≤ width ≤ 600)                     |
| center         | No       | int           | Whether the cloud phone display is centered                     | 0 = not centered, 1 = centered (default)             |
| hideLibrary    | No       | bool          | Whether to display the cloud phone Asset Library (Material Center) | true = do not display, false = display (default) |