Title: Distribution Links and Protocol Conventions

Protocols used

EEA:FOLDERPATH → Path to the published file store
WWW:URL → Human-friendly direct download/view page
Update rules

Always filter by protocol when updating linkage URLs.
Folder path usually ends with a trailing slash and mirrors the identifier, e.g.:
​https://sdi.eea.europa.eu/webdav/datastore/public/​/
WWW:URL should reference the new record UUID:
​https://sdi.eea.europa.eu/data/​<record_uuid>
Optional fields per CI_OnlineResource

cit:name: short label (e.g., “Direct download”)
cit:function: download, information, etc.
File: 07-checklists-and-qa.md Title: Quick Checklists and QA

Pre-edit checklist

Confirm target UUIDs, series UUIDs, and group IDs.
Verify the record schema is iso19115-3.
Identify all fields impacted by the annual rollover: title, identifier, abstract, temporal extent, lineage, distribution links.
Execution checklist (annual rollover)

Duplicate from last good template.
Title →
Identifier → …p_v01_r00
Dates: creation and publication → today; temporal extent → -01-01 to -12-31
Lineage: year mentions updated; links remain valid
Distribution: EEA:FOLDERPATH and WWW:URL updated
Optional: keywords, browse graphic, maintenance frequency
Series linking checklist

On dataset: add Series (partOf) → parent UUID
On series: add Aggregated datasets (isComposedOf) → child UUID
Run collection-updater on the series
Post-edit QA

Open the record view page; verify title and dates.
Test both distribution links.
If linked to a series, confirm the relationship appears correctly in both records.
If available, run metadata validation and fix warnings before approval/publish.
Troubleshooting

If update_record returns “processed 0”:
Re-check XPath and namespaces.
Confirm the field exists in this schema/block.
Ensure there isn’t more than one matching node; if multiple, refine the filter (e.g., by protocol).
If duplicate_record returns only an internal ID, fetch the UUID via get_record_by_id, then continue.