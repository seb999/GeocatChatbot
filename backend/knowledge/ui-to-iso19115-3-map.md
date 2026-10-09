Title: UI Field → ISO19115-3 XPath Map (Core)

Note: Use xml_ui_match.txt as the authoritative crosswalk. Below are the most used fields.

Title (UI: Title)

XPath: mdb:identificationInfo/*/mri:citation/cit:CI_Citation/cit:title/gco:CharacterString- Abstract (UI: Abstract)

XPath: mdb:identificationInfo/*/mri:abstract/gco:CharacterString- Identifier (UI: Resource identifier)

XPath: mdb:identificationInfo/*/mri:citation/cit:CI_Citation/cit:identifier/mcc:MD_Identifier/mcc:code/gco:CharacterString- Dates (UI: Citation dates)

Creation date: mdb:identificationInfo/*/mri:citation/cit:CI_Citation/cit:date/cit:CI_Date[cit:dateType/cit:CI_DateTypeCode/@codeListValue='creation']/cit:date/gco:Date - Publication date: same path with codeListValue='publication'

Temporal extent (UI: Temporal extent)

Begin: mdb:identificationInfo//mri:extent//gml:TimePeriod/gml:beginPosition - End: mdb:identificationInfo//mri:extent//gml:TimePeriod/gml:endPosition- Distribution online resources (UI: Distribution > Online resources)

By protocol filter:

Folder path (EEA:FOLDERPATH): mdb:distributionInfo//mrd:transferOptions//mrd:onLine/cit:CI_OnlineResource[cit:protocol/gco:CharacterString='EEA:FOLDERPATH']/cit:linkage/gco:CharacterString - Direct URL (WWW:URL): mdb:distributionInfo//mrd:transferOptions//mrd:onLine/cit:CI_OnlineResource[cit:protocol/gco:CharacterString='WWW:URL']/cit:linkage/gco:CharacterString- Lineage (UI: Lineage > Statement)

XPath: mdb:resourceLineage/mrl:LI_Lineage/mrl:statement/gco:CharacterString- Related resources (UI: Related resources > Associations)

See05-playbook-add-to-series.md for series/dataset links (associationType DS_AssociationTypeCode).