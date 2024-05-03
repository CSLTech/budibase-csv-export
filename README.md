# CSV Export

## Description
CSV Export Automation Step

Find out more about [Budibase](https://github.com/Budibase/budibase).

This brings in a CSV Export step to automation. This is meant to be more flexible than the built-in export. 
The resulting files are uploaded to an S3 bucket (or any other S3 compatible service). It is then up to you to notify the user or finish the process in some other way.

It also makes sense to detach this from the frontend flow in an asynchronous automation since the resulting files can be fairly large and take some time to generate.

## Important things to note

* To keep things simple, the current behavior is to export all columns in the order received by budibase, but this isn't necessarily ideal. I also don't think there would be an elegant way to configure columns in the current automation configuration schema.
* This requires you to supply the API url (ex: http://127.0.0.1/api/public/v1) and an API key to your budibase instance, since to the best of my knowledge there is no way for custom automations to call the internal API.

## Disclaimer
This is still very experimental and implemented to the best of my guesses as there is very little documentation and examples for custom automation steps.