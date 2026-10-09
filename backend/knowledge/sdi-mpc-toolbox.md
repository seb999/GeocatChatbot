Title: SDI-MPC Tool Usage Cheatsheet- Search and retrieve - Get a record summary: SDI-MPC-get_record_summary { uuid }

Get full record (XML JSON): SDI-MPC-get_record { uuid }

Create and duplicate - Duplicate from a template: SDI-MPC-duplicate_record { metadataUuid: <source_uuid>, group: <group_id> }

Update text fields (generic)

SDI-MPC-update_record { uuid, operation: "replace", xpath, value }

Use precise XPath from02-ui-to-iso19115-3-map.md or xml_ui_match.txt- Update title (auto schema-aware)

SDI-MPC-update_record_title { uuid, title }

Links/attachments - List attachments: SDI-MPC-get_attachments { metadataUuid }

Upload via URL: SDI-MPC-upload_url_to_record { metadataUuid, url, filename? }

Create user upload link: SDI-MPC-create_upload_link { metadataUuid, expiresInMinutes?, visibility? }

Tags/categories - Get tags: SDI-MPC-get_tags {}

Add/remove tags: SDI-MPC-add_record_tags / SDI-MPC-delete_record_tags- Relationships and processes - Related records: SDI-MPC-get_related_records { uuid, type }

Apply XSL process: SDI-MPC-process_record { metadataUuid, process, params? }

Example: collection-updater for series after linking datasets (see05-playbook-add-to-series.md)
