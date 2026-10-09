Title: Add Dataset to Series (ISO 19115-3 Associations)

Goal: Link a dataset (child) to a series (parent) using proper association codes.

Definitions

On dataset (child): associationType = partOf, pointing to parent series UUID.
On series (parent): associationType = isComposedOf, pointing to child dataset UUID.
ISO 19115-3 placement

Use aggregation info/associated resources depending on profile. In GeoNetwork, use the Related resources UI; it maps to MD_AssociatedResource or MD_AggregateInformation.
For automation, add nodes via SDI-MPC-update_record (XPath) or preferred process if available. When in doubt, use the UI mapping from xml_ui_match.txt for:
Dataset → Related resources > Series (associationType='partOf') → parent UUID
Series → Related resources > Aggregated datasets (associationType='isComposedOf') → child UUID
Procedure (automated)

On dataset (child_uuid)

Add association: Series (partOf) → parent_uuid
XPath pattern (example; confirm via xml_ui_match.txt):
mdb:identificationInfo/*/mri:associatedResource/mri:MD_AssociatedResource
mri:associationType/mri:DS_AssociationTypeCode/@codeListValue = 'partOf'
mri:metadataReference/@uuidref = parent_uuid
On series (parent_uuid)

Add association: Aggregated datasets (isComposedOf) → child_uuid
XPath pattern:
mdb:identificationInfo/*/mri:associatedResource/mri:MD_AssociatedResource
mri:associationType/mri:DS_AssociationTypeCode/@codeListValue = 'isComposedOf'
mri:metadataReference/@uuidref = child_uuid
Refresh collection view on the series

Tool: SDI-MPC-process_record
Inputs: { metadataUuid: parent_uuid, process: 'collection-updater' }
Notes

If your catalogue uses mri:aggregationInfo instead of mri:associatedResource, switch paths accordingly. The ui-to-xml crosswalk governs which block is used.