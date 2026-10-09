Title: Annual Rollover from Previous Year TemplateGoal: Create a new year’s dataset by duplicating and updating key fields.

Steps1) Duplicate a last-good-year record into the correct group - Tool: SDI-MPC-duplicate_record - Inputs: { metadataUuid: <template_uuid>, group: <target_group_id> }

Update the title - Tool: SDI-MPC-update_record_title - Title pattern: AI pm10, European air quality data for , (interpolated data)
Update identifier and dates - Identifier: eea_r_3035_1_km_aq-interpolated-pm10_p__v01_r00 - XPath: citation identifier code (see map)
Creation/publication: today’s date (ISO yyyy-mm-dd)
Temporal extent: -01-01 to -12-314) Abstract and lineage - Replace Abstract to reference the new year () explicitly.
Replace Lineage statement where the year is mentioned; keep methodology references consistent.
Distribution links - Folder path (EEA:FOLDERPATH): …//
Direct URL (WWW:URL): ​https://sdi.eea.europa.eu/data/​<record_uuid>
Optional - Update browse graphic/thumbnail filename if year is embedded.
Add annual keywords or temporal update frequency if needed.
Quality checks- Validate the title, identifier, temporal extent dates, and both distribution links.

Confirm schema is iso19115-3 and XPaths were applied correctly.